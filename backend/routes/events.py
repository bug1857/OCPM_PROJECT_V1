from fastapi import APIRouter, UploadFile, File, HTTPException
from database import SessionLocal
from models import EventLog

import pandas as pd
import io
from collections import defaultdict

router = APIRouter()

# ─────────────────────────────────────────────
# SQL EVENT INSERT (legacy endpoint)
# ─────────────────────────────────────────────
@router.post("/upload-event")
def upload_event(event: dict):
    db = SessionLocal()

    try:
        new_event = EventLog(
            process_id=event["process_id"],
            case_id=event["case_id"],
            activity=event["activity"],
            time=event["time"],
            cost=event["cost"],
            emission=event["emission"]
        )

        db.add(new_event)
        db.commit()

        return {"message": "event stored"}

    finally:
        db.close()


# ─────────────────────────────────────────────
# OCEL IN-MEMORY STORE
# ─────────────────────────────────────────────
EVENT_DF = None
TRACE_STORE = {}

STATS = {
    "total_traces": 0,
    "carbon_violations": 0,
    "seq_violations": 0,
    "total_emission": 0,
    "avg_carbon_fitness": 0.0,
    "compliance_rate": 0.0
}


# ─────────────────────────────────────────────
# TRACE BUILDER (OCEL ENGINE CORE)
# ─────────────────────────────────────────────
def build_traces(df: pd.DataFrame):
    traces = defaultdict(list)

    for _, row in df.iterrows():
        traces[row["order_id"]].append(row)

    result = {}

    stats = {
        "total_traces": len(traces),
        "carbon_violations": 0,
        "seq_violations": 0,
        "total_emission": 0,
    }

    for order_id, events in traces.items():
        events = sorted(events, key=lambda x: x["timestamp"])

        activities = []
        total_emission = 0
        carbon_budget = events[0]["carbon_budget"]
        violation = False

        for e in events:
            activities.append(e["activity"])
            total_emission += float(e["carbon_factor"])

            if str(e.get("violation_type", "")).lower() == "carbon":
                stats["carbon_violations"] += 1
                violation = True

        expected_flow = [
            "Create Order",
            "Goods Issue",
            "Freight Booking",
            "Warehouse Transfer",
            "Customs Clearance",
            "Delivery"
        ]

        seq_ok = all(a in activities for a in expected_flow)
        if not seq_ok:
            stats["seq_violations"] += 1
            violation = True

        carbon_fitness = min(1.0, carbon_budget / max(total_emission, 1))

        trace_obj = {
            "order_id": order_id,
            "supplier_id": events[0]["supplier_id"],
            "activities": activities,
            "transport_used": next(
                (e.get("transport_used") for e in events if e.get("transport_used")),
                ""
            ),
            "carbon_fitness": round(carbon_fitness, 4),
            "seq_fitness": round(1.0 if seq_ok else 0.6, 4),
            "carbon_budget": carbon_budget,
            "total_emission": round(total_emission, 2),
            "carbon_ok": carbon_fitness >= 0.8,
            "event_count": len(events),
        }

        TRACE_STORE[order_id] = trace_obj
        result[order_id] = trace_obj

        stats["total_emission"] += total_emission

    stats["compliance_rate"] = round(
        100 * (1 - (stats["carbon_violations"] + stats["seq_violations"]) /
        max(stats["total_traces"], 1)),
        2
    )

    stats["avg_carbon_fitness"] = round(
        sum(t["carbon_fitness"] for t in TRACE_STORE.values()) /
        max(len(TRACE_STORE), 1),
        4
    )

    return result, stats


# ─────────────────────────────────────────────
# CSV UPLOAD (OCEL ENTRY POINT)
# ─────────────────────────────────────────────
@router.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        df = pd.read_csv(io.StringIO(content.decode("utf-8")))

        required_cols = [
            "event_id",
            "order_id",
            "supplier_id",
            "activity",
            "timestamp",
            "carbon_factor",
            "carbon_budget"
        ]

        for col in required_cols:
            if col not in df.columns:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing column: {col}"
                )

        global EVENT_DF
        EVENT_DF = df

        traces, stats = build_traces(df)

        global STATS
        STATS = stats

        return {
            "message": "uploaded successfully",
            "stats": stats,
            "traces_built": len(traces)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# GET TRACES (UI)
# ─────────────────────────────────────────────
@router.get("/traces")
def get_traces(limit: int = 20, offset: int = 0, violation_only: bool = False):

    traces = list(TRACE_STORE.values())

    if violation_only:
        traces = [t for t in traces if not t["carbon_ok"]]

    return {
        "total": len(traces),
        "traces": traces[offset: offset + limit]
    }


# ─────────────────────────────────────────────
# SINGLE TRACE
# ─────────────────────────────────────────────
@router.get("/trace/{order_id}")
def get_trace(order_id: str):

    trace = TRACE_STORE.get(order_id)

    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    return {
        "summary": trace,
        "events": []
    }


# ─────────────────────────────────────────────
# STATS
# ─────────────────────────────────────────────
@router.get("/stats")
def get_stats():
    return STATS