

from fastapi import FastAPI, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import random
from routes.conformance import router as conformance_router

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from engine.parser import parse_csv, build_traces, trace_summary, aggregate_stats, compute_kpis
from engine.mining import cluster_variants

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conformance_router)

# ─── IN-MEMORY STORES ─────────────────────────────────────────────────────────

event_store = [
    {"activity": "Create Order",    "cost": 10,  "emission": 20,  "time": 5},
    {"activity": "Freight Booking", "cost": 50,  "emission": 45,  "time": 30},
    {"activity": "Transport Air",   "cost": 300, "emission": 95,  "time": 120},
    {"activity": "Warehouse",       "cost": 40,  "emission": 35,  "time": 20},
    {"activity": "Delivery",        "cost": 60,  "emission": 50,  "time": 40},
]

uploaded_events:    list[dict] = []
uploaded_traces:    dict       = {}
uploaded_summaries: list[dict] = []

# ─── SEED DATA ────────────────────────────────────────────────────────────────

# BUG-M3 FIX: Freight Booking unified to 8 (matches token_replay.py)
EMISSION_FACTORS = {
    "Air Freight":        300.0,
    "Road Freight":       120.0,
    "Sea Freight":         50.0,
    "Warehouse Transfer":  20.0,
    "Customs Clearance":   15.0,
    "Delivery":            10.0,
    "Goods Issue":          5.0,
    "Freight Booking":      8.0,
    "Supplier Selection":   2.0,
    "Create Order":         1.0,
}

RATINGS = ["A", "B", "B", "C", "C", "D", "E"]

random.seed(42)
SUPPLIERS = []
for i in range(1, 51):
    sid    = f"S{i:03d}"
    rating = random.choice(RATINGS)
    ci     = round(random.uniform(0.8, 4.5), 2)
    events = random.randint(800, 3200)
    emit   = round(ci * random.randint(15000, 80000))
    viols  = random.randint(0, 120) if rating in ["D", "E"] else random.randint(0, 30)
    SUPPLIERS.append({
        "supplier_id":      sid,
        "rating":           rating,
        "carbon_intensity": ci,
        "total_emissions":  emit,
        "total_events":     events,
        "violations":       viols,
    })
SUPPLIERS.sort(key=lambda s: s["total_emissions"], reverse=True)

random.seed(99)
VIOLATIONS = []
for i in range(1, 3407):
    s      = random.choice(SUPPLIERS[:20])
    budget = random.choice([150, 250, 300])
    emit   = round(random.uniform(budget * 1.05, budget * 3.5), 1)
    fitness = round(min(1.0, budget / emit), 3)
    vtype_roll = random.random()
    vtype  = "Carbon Violation" if vtype_roll < 0.62 else (
             "Process Violation" if vtype_roll < 0.88 else "Data Quality Issue")
    VIOLATIONS.append({
        "order_id":        f"O{i:05d}",
        "supplier_id":     s["supplier_id"],
        "total_emission":  emit,   # BUG-M6 FIX: was total_emissions (with s)
        "budget":          budget,
        "carbon_fitness":  fitness,
        "violation_type":  vtype,
    })

# ─── HEALTH ───────────────────────────────────────────────────────────────────

@app.get("/")
def home():
    return {"status": "running"}

# ─── EVENTS (legacy seed store) ───────────────────────────────────────────────

@app.post("/upload-event")
def upload_event(event: dict):
    event_store.append(event)
    return {"status": "stored", "total": len(event_store)}

@app.get("/insights/{process_id}")
def get_insights(process_id: str):
    if not event_store:
        return {"insights": []}
    metrics = {}
    for e in event_store:
        a = e["activity"]
        if a not in metrics:
            metrics[a] = {"cost": 0, "emission": 0, "time": 0, "count": 0}
        metrics[a]["cost"]     += e["cost"]
        metrics[a]["emission"] += e["emission"]
        metrics[a]["time"]     += e["time"]
        metrics[a]["count"]    += 1
    return {"insights": [
        {
            "id":          k,
            "avgCost":     v["cost"] / v["count"],
            "avgEmission": v["emission"] / v["count"],
            "avgTime":     v["time"] / v["count"],
        }
        for k, v in metrics.items()
    ]}

# ─── PHASE 1: CSV UPLOAD ──────────────────────────────────────────────────────

@app.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    global uploaded_events, uploaded_traces, uploaded_summaries

    content = await file.read()
    events  = parse_csv(content)

    if not events:
        return {"error": "No valid events parsed", "count": 0}

    traces    = build_traces(events)
    summaries = [trace_summary(t) for t in traces.values()]

    uploaded_events    = events
    uploaded_traces    = traces
    uploaded_summaries = summaries

    stats = aggregate_stats(summaries)
    return {
        "status":        "ok",
        "events_parsed": len(events),
        "traces_parsed": len(traces),
        "stats":         stats,
    }

@app.get("/event-log")
def get_event_log(
    limit:       int = 50,
    offset:      int = 0,
    order_id:    Optional[str] = None,
    supplier_id: Optional[str] = None,
    activity:    Optional[str] = None,
):
    filtered = uploaded_events
    if order_id:    filtered = [e for e in filtered if e["order_id"]    == order_id.upper()]
    if supplier_id: filtered = [e for e in filtered if e["supplier_id"] == supplier_id.upper()]
    if activity:    filtered = [e for e in filtered if activity.lower() in e["activity"].lower()]
    return {
        "total":  len(filtered),
        "events": filtered[offset: offset + limit],
    }

@app.get("/event-log/stats")
def get_event_log_stats():
    if not uploaded_summaries:
        return {"loaded": False}
    stats = aggregate_stats(uploaded_summaries)
    return {"loaded": True, **stats}

@app.get("/event-log/traces")
def get_traces(
    limit:          int  = 20,
    offset:         int  = 0,
    violation_only: bool = False,
):
    summaries = uploaded_summaries
    if violation_only:
        summaries = [s for s in summaries if s["has_violation"] or not s["carbon_ok"]]
    return {
        "total":  len(summaries),
        "traces": summaries[offset: offset + limit],
    }

@app.get("/event-log/trace/{order_id}")
def get_trace(order_id: str):
    trace = uploaded_traces.get(order_id.upper())
    if not trace:
        return {"error": "Trace not found"}
    summary = trace_summary(trace)
    return {"summary": summary, "events": trace}

# ─── KPIs ─────────────────────────────────────────────────────────────────────

@app.get("/kpis")
def get_kpis():
    if uploaded_summaries:
        kpis = compute_kpis(uploaded_summaries)
        return {
            "total_orders":    kpis["total_orders"],
            "violations":      kpis["violation_count"],
            "compliance_pct":  kpis["compliance_pct"],
            "avg_emission_kg": kpis["avg_emission_kg"],
            "total_co2e_kg":   kpis["total_co2e_kg"],
            "max_emission_kg": kpis["max_emission_kg"],
        }
    return {
        "total_orders":    10000,
        "violations":      3406,
        "compliance_pct":  65.94,
        "avg_emission_kg": 226.8,
        "total_co2e_kg":   2268000,
        "max_emission_kg": 847,
    }

# ─── TRANSPORT ────────────────────────────────────────────────────────────────

@app.get("/transport")
def get_transport():
    if uploaded_events:
        air_events  = sum(1 for e in uploaded_events if "AIR"  in str(e.get("transport_type", "")).upper()
                         or e.get("activity") == "Air Freight")
        sea_events  = sum(1 for e in uploaded_events if "SEA"  in str(e.get("transport_type", "")).upper()
                         or e.get("activity") == "Sea Freight")
        road_events = sum(1 for e in uploaded_events if "ROAD" in str(e.get("transport_type", "")).upper()
                         or e.get("activity") == "Road Freight")
        total_events = max(air_events + sea_events + road_events, 1)

        # Use carbon_factor as emission value (it's the per-event emission in kg)
        air_emit  = sum(float(e.get("carbon_factor", 0)) for e in uploaded_events
                       if "AIR" in str(e.get("transport_type", "")).upper()
                       or e.get("activity") == "Air Freight")
        sea_emit  = sum(float(e.get("carbon_factor", 0)) for e in uploaded_events
                       if "SEA" in str(e.get("transport_type", "")).upper()
                       or e.get("activity") == "Sea Freight")
        road_emit = sum(float(e.get("carbon_factor", 0)) for e in uploaded_events
                       if "ROAD" in str(e.get("transport_type", "")).upper()
                       or e.get("activity") == "Road Freight")
        total_transport = max(air_emit + sea_emit + road_emit, 1)

        return {
            "total_transport_co2e": round(total_transport, 1),
            "breakdown": [
                {
                    "transport_type": "Air Freight",
                    "emissions":      round(air_emit,  1),
                    "pct_of_total":   round(air_emit  / total_transport * 100, 1),
                    "frequency":      air_events,
                },
                {
                    "transport_type": "Road Freight",
                    "emissions":      round(road_emit, 1),
                    "pct_of_total":   round(road_emit / total_transport * 100, 1),
                    "frequency":      road_events,
                },
                {
                    "transport_type": "Sea Freight",
                    "emissions":      round(sea_emit,  1),
                    "pct_of_total":   round(sea_emit  / total_transport * 100, 1),
                    "frequency":      sea_events,
                },
            ],
        }

    return {
        "total_transport_co2e": 1615069,
        "breakdown": [
            {"transport_type": "Air Freight",  "emissions": 807534, "pct_of_total": 50.0, "frequency": 2691},
            {"transport_type": "Road Freight", "emissions": 483521, "pct_of_total": 30.0, "frequency": 4027},
            {"transport_type": "Sea Freight",  "emissions": 324014, "pct_of_total": 20.0, "frequency": 6481},
        ],
    }

# ─── SUPPLIERS ────────────────────────────────────────────────────────────────

@app.get("/suppliers")
def get_suppliers():
    if uploaded_events:
        supplier_map: dict = {}

        for e in uploaded_events:
            sid = e["supplier_id"]

            if sid not in supplier_map:
                supplier_map[sid] = {
                    "supplier_id":      sid,
                    "rating":           e.get("supplier_rating", "C"),
                    "carbon_intensity": 0.0,
                    "_ci_sum":          0.0,
                    "_ci_count":        0,
                    "total_emissions":  0.0,
                    "total_events":     0,
                    "violations":       0,
                }

            # BUG-M1 FIX: carbon_factor IS the emission value in kg — don't
            # multiply by EMISSION_FACTORS again (that was double-counting).
            emission = float(e.get("carbon_factor", 0))
            supplier_map[sid]["total_emissions"] += emission
            supplier_map[sid]["total_events"]    += 1

            # Carbon intensity: the carbon_factor per unit (use as proxy)
            # Real CI = emission / ef_for_activity, but without distance data
            # we track it as the average carbon_factor per event.
            supplier_map[sid]["_ci_sum"]   += float(e.get("carbon_factor", 0))
            supplier_map[sid]["_ci_count"] += 1

            vt = str(e.get("violation_type", "")).strip().upper()
            if vt not in ("", "NONE", "COMPLIANT"):
                supplier_map[sid]["violations"] += 1

        for s in supplier_map.values():
            s["carbon_intensity"] = round(
                s["_ci_sum"] / max(s["_ci_count"], 1), 2
            )
            s["total_emissions"] = round(s["total_emissions"], 1)
            del s["_ci_sum"]
            del s["_ci_count"]

        suppliers = sorted(
            supplier_map.values(),
            key=lambda x: x["total_emissions"],
            reverse=True,
        )

        return {"count": len(suppliers), "suppliers": suppliers}

    return {"count": len(SUPPLIERS), "suppliers": SUPPLIERS}

# ─── ACTIVITIES ───────────────────────────────────────────────────────────────

@app.get("/activities")
def get_activities():
    total = sum(EMISSION_FACTORS.values()) * 420
    activities = []
    for name, ef in sorted(EMISSION_FACTORS.items(), key=lambda x: -x[1]):
        emit = ef * 420
        activities.append({
            "activity":        name,
            "total_emissions": emit,
            "pct_of_total":    round(emit / total * 100, 1),
        })
    return {"activities": activities, "total_activity_co2e": total}

# ─── VIOLATIONS ───────────────────────────────────────────────────────────────

def _build_violations_from_upload() -> list[dict]:
    """
    Build per-order violation records from uploaded events.
    Uses carbon_factor directly as emission (BUG-M1 FIX applied here too).
    BUG-M6 FIX: key is 'total_emission' (no trailing s) to match conformance endpoint.
    """
    emit_map:    dict[str, float] = {}
    budget_map:  dict[str, float] = {}
    supplier_map: dict[str, str]  = {}
    vtype_map:   dict[str, str]  = {}

    for e in uploaded_events:
        oid = e.get("order_id", "")
        if not oid:
            continue
        # sum carbon_factor as emission (it IS the emission value)
        emit_map[oid]     = emit_map.get(oid, 0.0) + float(e.get("carbon_factor", 0))
        budget_map[oid]   = float(e.get("carbon_budget", 300))
        supplier_map[oid] = e.get("supplier_id", "")
        raw_vt = e.get("violation_type", "NONE").upper()
        if raw_vt not in ("", "NONE", "COMPLIANT"):
            vtype_map[oid] = raw_vt

    results = []
    for oid, total_emit in emit_map.items():
        raw_vt = vtype_map.get(oid, "")
        if not raw_vt:
            continue
        budget = budget_map.get(oid, 300.0)
        if "CARBON"  in raw_vt: vtype_display = "Carbon Violation"
        elif "PROCESS" in raw_vt: vtype_display = "Process Violation"
        else:                     vtype_display = "Data Quality Issue"
        fitness = round(min(1.0, budget / max(total_emit, 0.001)), 3)
        results.append({
            "order_id":       oid,
            "supplier_id":    supplier_map.get(oid, ""),
            "total_emission": round(total_emit, 1),   # BUG-M6 FIX: no trailing 's'
            "budget":         budget,
            "carbon_fitness": fitness,
            "violation_type": vtype_display,
        })
    return results


@app.get("/violations")
def get_violations(
    limit:          int = 20,
    offset:         int = 0,
    violation_type: Optional[str] = None,
    supplier_id:    Optional[str] = None,
):
    source = _build_violations_from_upload() if uploaded_events else VIOLATIONS

    filtered = source
    if violation_type:
        filtered = [v for v in filtered if violation_type.lower() in v["violation_type"].lower()]
    if supplier_id:
        filtered = [v for v in filtered if v["supplier_id"] == supplier_id.upper()]

    # BUG-M2 FIX: always use compute_kpis for sub-type counts (single source of truth)
    # Never mix compute_kpis() totals with _build_violations_from_upload() totals.
    if uploaded_summaries:
        kpis          = compute_kpis(uploaded_summaries)
        carbon_count  = kpis["carbon_violations"]
        process_count = kpis["process_violations"]
        data_count    = kpis["data_violations"]
        # total is the number from source (may be filtered), headline uses kpis
        total_violations = kpis["violation_count"]
    else:
        all_v         = source   # unfiltered for counts
        carbon_count  = sum(1 for v in all_v if "carbon"  in v["violation_type"].lower())
        process_count = sum(1 for v in all_v if "process" in v["violation_type"].lower())
        data_count    = sum(1 for v in all_v if "data"    in v["violation_type"].lower())
        total_violations = len(all_v)

    return {
        "total":              len(filtered),      # paginated/filtered count for table
        "total_violations":   total_violations,   # overall headline count
        "carbon_violations":  carbon_count,
        "process_violations": process_count,
        "data_violations":    data_count,
        "violations":         filtered[offset: offset + limit],
    }

# ─── RECOMMENDATIONS ──────────────────────────────────────────────────────────

@app.get("/recommendations")
def get_recommendations():
    random.seed(7)
    recs = []
    for i in range(10):
        s         = SUPPLIERS[i]
        ci        = s["carbon_intensity"]
        air_emit  = round(300 * ci, 1)
        sea_emit  = round( 50 * ci, 1)
        saving    = round(air_emit - sea_emit, 1)
        pct       = round(saving / air_emit * 100, 1) if air_emit > 0 else 0
        recs.append({
            "order_id":           f"O{i+1:05d}",
            "supplier_id":        s["supplier_id"],
            "carbon_intensity":   ci,
            "budget":             300,
            "current_mode":       "Air Freight",
            "current_emission":   air_emit,
            "recommended_mode":   "Sea Freight",
            "recommended_emission": sea_emit,
            "saving_kg":          saving,
            "saving_pct":         pct,
        })
    recs.sort(key=lambda r: -r["saving_kg"])
    total_air = sum(r["current_emission"]     for r in recs)
    total_sea = sum(r["recommended_emission"] for r in recs)
    return {
        "fleet_summary": {
            "current_air_co2e":    total_air,
            "optimized_sea_co2e":  total_sea,
            "potential_saving_kg": round(total_air - total_sea, 1),
            "reduction_pct":       round((total_air - total_sea) / total_air * 100, 1) if total_air > 0 else 0,
        },
        "top_recommendations": recs,
    }

# ─── PROCESS MAP ──────────────────────────────────────────────────────────────

@app.get("/process-map")
def get_process_map():
    nodes = [
        {"id": "Create Order"}, {"id": "Goods Issue"}, {"id": "Freight Booking"},
        {"id": "Air Freight"}, {"id": "Sea Freight"}, {"id": "Road Freight"},
        {"id": "Customs Clearance"}, {"id": "Warehouse Transfer"}, {"id": "Delivery"},
    ]
    edges = [
        {"source": "Create Order",       "target": "Goods Issue",        "count": 10000, "emissions": 50000},
        {"source": "Goods Issue",        "target": "Freight Booking",    "count": 9800,  "emissions": 49000},
        {"source": "Freight Booking",    "target": "Air Freight",        "count": 2691,  "emissions": 807534},
        {"source": "Freight Booking",    "target": "Sea Freight",        "count": 6481,  "emissions": 324014},
        {"source": "Freight Booking",    "target": "Road Freight",       "count": 4027,  "emissions": 483521},
        {"source": "Air Freight",        "target": "Customs Clearance",  "count": 2691,  "emissions": 40365},
        {"source": "Sea Freight",        "target": "Customs Clearance",  "count": 6481,  "emissions": 97215},
        {"source": "Road Freight",       "target": "Warehouse Transfer", "count": 4027,  "emissions": 80540},
        {"source": "Customs Clearance",  "target": "Warehouse Transfer", "count": 9172,  "emissions": 183440},
        {"source": "Warehouse Transfer", "target": "Delivery",           "count": 10000, "emissions": 100000},
    ]
    return {"nodes": nodes, "edges": edges}


@app.get("/process-variants")
def get_process_variants():
    if not uploaded_traces:
        seed_variants = [
            {"rank":1,"variant":["Create Order","Goods Issue","Freight Booking","Sea Freight","Warehouse Transfer","Customs Clearance","Delivery"],"variant_str":"Create Order → Goods Issue → Freight Booking → Sea Freight → Warehouse Transfer → Customs Clearance → Delivery","count":6481,"frequency_pct":64.81,"avg_emission_kg":174.3,"min_emission_kg":120.1,"max_emission_kg":240.5,"transport_modes":["Sea Freight"],"is_normative":True,"step_count":7},
            {"rank":2,"variant":["Create Order","Goods Issue","Freight Booking","Road Freight","Warehouse Transfer","Customs Clearance","Delivery"],"variant_str":"Create Order → Goods Issue → Freight Booking → Road Freight → Warehouse Transfer → Customs Clearance → Delivery","count":4027,"frequency_pct":40.27,"avg_emission_kg":410.6,"min_emission_kg":280.2,"max_emission_kg":560.8,"transport_modes":["Road Freight"],"is_normative":True,"step_count":7},
            {"rank":3,"variant":["Create Order","Goods Issue","Freight Booking","Air Freight","Warehouse Transfer","Customs Clearance","Delivery"],"variant_str":"Create Order → Goods Issue → Freight Booking → Air Freight → Warehouse Transfer → Customs Clearance → Delivery","count":2691,"frequency_pct":26.91,"avg_emission_kg":862.4,"min_emission_kg":600.0,"max_emission_kg":1200.0,"transport_modes":["Air Freight"],"is_normative":False,"step_count":7},
            {"rank":4,"variant":["Create Order","Goods Issue","Air Freight","Delivery"],"variant_str":"Create Order → Goods Issue → Air Freight → Delivery","count":412,"frequency_pct":4.12,"avg_emission_kg":743.1,"min_emission_kg":600.0,"max_emission_kg":900.0,"transport_modes":["Air Freight"],"is_normative":False,"step_count":4},
            {"rank":5,"variant":["Create Order","Goods Issue","Goods Issue","Freight Booking","Sea Freight","Warehouse Transfer","Customs Clearance","Delivery"],"variant_str":"Create Order → Goods Issue → Goods Issue → Freight Booking → Sea Freight → Warehouse Transfer → Customs Clearance → Delivery","count":189,"frequency_pct":1.89,"avg_emission_kg":186.7,"min_emission_kg":130.0,"max_emission_kg":250.0,"transport_modes":["Sea Freight"],"is_normative":False,"step_count":8},
        ]
        return {
            "total_traces":    10000,
            "unique_variants": 12,
            "top_variants":    seed_variants,
            "source":          "demo",
        }

    result = cluster_variants(uploaded_traces)
    result["source"] = "live"
    return result

# ─── SIMULATE ─────────────────────────────────────────────────────────────────

@app.get("/simulate")
def simulate(current_mode: str = "Air Freight", target_mode: str = "Sea Freight"):
    ef          = EMISSION_FACTORS
    curr_ef     = ef.get(current_mode,  300)
    target_ef   = ef.get(target_mode,    50)
    avg_ci      = 2.34
    curr_emit   = round(curr_ef   * avg_ci, 1)
    target_emit = round(target_ef * avg_ci, 1)
    saving      = round(curr_emit - target_emit, 1)
    reduction   = round(saving / curr_emit * 100, 1) if curr_emit > 0 else 0
    return {
        "current_mode":    current_mode,
        "target_mode":     target_mode,
        "current_emission": curr_emit,
        "target_emission":  target_emit,
        "saving_kg":       saving,
        "reduction_pct":   reduction,
    }

# ─── AI RISK / COPILOT ────────────────────────────────────────────────────────

_RATING_MAP = {"A": 5, "B": 4, "C": 3, "D": 2, "E": 1}


def _parse_rating(supplier_rating: str) -> float:
    try:
        return float(supplier_rating)
    except ValueError:
        return float(_RATING_MAP.get(supplier_rating.upper(), 3))


@app.get("/ai-risk")
def get_ai_risk(
    supplier_rating:          str   = "3",
    carbon_intensity:         float = 2.5,
    air_freight_probability:  float = 0.5,
):
    rating_num  = _parse_rating(supplier_rating)
    base        = (5 - rating_num) * 12 + carbon_intensity * 8 + air_freight_probability * 35
    probability = round(min(99, max(1, base)), 1)
    risk        = "HIGH" if probability >= 60 else ("MEDIUM" if probability >= 35 else "LOW")
    return {"probability": probability, "risk": risk}


@app.get("/ai-copilot")
def get_ai_copilot(
    supplier_rating:          str   = "3",
    carbon_intensity:         float = 2.5,
    air_freight_probability:  float = 0.5,
):
    rating_num  = _parse_rating(supplier_rating)
    base        = (5 - rating_num) * 12 + carbon_intensity * 8 + air_freight_probability * 35
    probability = round(min(99, max(1, base)), 1)
    optimized   = round(probability * 0.45, 1)
    risk        = "HIGH" if probability >= 60 else ("MEDIUM" if probability >= 35 else "LOW")

    drivers = []
    if air_freight_probability >= 0.7: drivers.append("High air freight dependency")
    if carbon_intensity >= 4:          drivers.append("Elevated supplier carbon intensity")
    if rating_num <= 2:                drivers.append("Low supplier ESG rating")
    if not drivers:                    drivers.append("Logistics profile within acceptable range")

    recs = []
    if air_freight_probability >= 0.7: recs.append("Shift to sea freight for non-urgent shipments")
    if carbon_intensity >= 4:          recs.append("Source from lower carbon-intensity suppliers")
    if rating_num <= 2:                recs.append("Initiate supplier ESG improvement programme")
    if not recs:                       recs.append("Maintain current logistics configuration")

    return {
        "probability":           probability,
        "optimized_probability": optimized,
        "risk":                  risk,
        "drivers":               drivers,
        "recommendations":       recs,
    }

# ─── GREEN ROUTE ──────────────────────────────────────────────────────────────

@app.get("/green-route")
def get_green_route(
    supplier_rating:         float = 4,
    carbon_intensity:        float = 2.5,
    air_freight_probability: float = 0.5,
):
    return {
        "current_path":        ["Create Order", "Goods Issue", "Air Freight", "Customs Clearance", "Delivery"],
        "recommended_path":    ["Create Order", "Goods Issue", "Sea Freight", "Customs Clearance", "Delivery"],
        "estimated_reduction": 83.3,
        "compliance_status":   "COMPLIANT after rerouting",
    }

# ─── CARBON FITNESS ───────────────────────────────────────────────────────────

@app.get("/carbon-fitness")
def get_carbon_fitness(
    supplier_rating:         float = 4,
    carbon_intensity:        float = 2.5,
    air_freight_probability: float = 0.5,
    order_type:              str   = "standard",
):
    # BUG-M4 FIX: use ORDER_BUDGET_TIERS instead of hardcoded 300
    from engine.token_replay import ORDER_BUDGET_TIERS
    budget = ORDER_BUDGET_TIERS.get(order_type.lower(), 150.0)

    actual  = round(
        (air_freight_probability * 300 + (1 - air_freight_probability) * 50) * carbon_intensity, 1
    )
    fitness     = round(min(1.0, budget / max(actual, 0.001)), 3)
    fitness_pct = round(fitness * 100)
    grade       = ("A" if fitness_pct >= 90 else
                   "B" if fitness_pct >= 75 else
                   "C" if fitness_pct >= 55 else
                   "D" if fitness_pct >= 35 else "E")
    return {
        "carbon_fitness":     fitness,
        "carbon_fitness_pct": fitness_pct,
        "grade":              grade,
        "actual_emission":    actual,
        "budget":             budget,
        "order_type":         order_type,
    }

# ─── EMISSION ATTRIBUTION ─────────────────────────────────────────────────────

@app.get("/emission-attribution")
def get_emission_attribution():
    return {
        "total_emission":    807534,
        "hotspot_activity":  "Air Freight",
        "breakdown": [
            {"activity": "Air Freight",  "emission": 807534, "pct": 50.0},
            {"activity": "Road Freight", "emission": 483521, "pct": 30.0},
            {"activity": "Sea Freight",  "emission": 324014, "pct": 20.0},
        ],
    }

# ─── CARBON BUDGETS ───────────────────────────────────────────────────────────

@app.post("/carbon-budgets")
def save_budgets(payload: dict):
    from routes.conformance import apply_custom_budgets
    apply_custom_budgets(payload.get("budgets", {}))
    return {"status": "saved"}


@app.get("/carbon-budgets")
def get_budgets():
    from routes.conformance import CARBON_BUDGETS
    return {"budgets": CARBON_BUDGETS}

# ─── EXPORT BRSR PDF ──────────────────────────────────────────────────────────

@app.get("/export-brsr-pdf")
def export_brsr_pdf():
    import tempfile
    from datetime import date
    from fastapi.responses import FileResponse
    from xhtml2pdf import pisa
    from io import BytesIO

    if uploaded_summaries:
        kpis = compute_kpis(uploaded_summaries)
        total_orders       = kpis["total_orders"]
        violations         = kpis["violation_count"]
        carbon_violations  = kpis["carbon_violations"]
        process_violations = kpis["process_violations"]
        data_violations    = kpis["data_violations"]
        compliance_pct     = kpis["compliance_pct"]
        avg_emission       = kpis["avg_emission_kg"]
        total_co2e         = kpis["total_co2e_kg"]

        total_suppliers = len({
            str(s.get("supplier_id", "UNKNOWN")) for s in uploaded_summaries
        })
        a_rated = len({
            e["supplier_id"] for e in uploaded_events
            if str(e.get("supplier_rating", "")).upper() == "A"
        })
        e_rated = len({
            e["supplier_id"] for e in uploaded_events
            if str(e.get("supplier_rating", "")).upper() == "E"
        })

        cf_values = [float(s["carbon_fitness"]) for s in uploaded_summaries if "carbon_fitness" in s]
        carbon_fitness_pct = round((sum(cf_values) / len(cf_values)) * 100, 1) if cf_values else round(compliance_pct, 1)

        air_events = sum(
            1 for e in uploaded_events
            if "AIR" in str(e.get("transport_type", "")).upper()
            or e.get("activity") == "Air Freight"
        )
        sea_events = sum(
            1 for e in uploaded_events
            if "SEA" in str(e.get("transport_type", "")).upper()
            or e.get("activity") == "Sea Freight"
        )
        transport_total = max(air_events + sea_events, 1)
        air_pct = round((air_events / transport_total) * 100, 1)
        sea_pct = round((sea_events / transport_total) * 100, 1)

    else:
        total_orders       = 10000
        violations         = 3406
        carbon_violations  = 2113
        process_violations = 900
        data_violations    = 393
        compliance_pct     = 65.94
        avg_emission       = 226.8
        total_co2e         = 2268000
        air_pct            = 50.0
        sea_pct            = 20.0
        total_suppliers    = 50
        a_rated            = 8
        e_rated            = 5
        carbon_fitness_pct = 61.5

    today   = date.today().strftime("%d %B %Y")
    fy      = "2024-25"
    # BUG-M5 FIX: scope3_kg should stay in kg for the PDF display
    scope3_kg = round(total_co2e * 71.1 / 100, 0)  # total kg, not /1000
    # Display as thousands in the template:
    scope3_display = f"{int(scope3_kg / 1000):,}k kg CO₂e"
    air_save_kg   = round(total_co2e * air_pct / 100 * 0.83, 0)
    air_save_display = f"{int(air_save_kg / 1000):,}k kg"

    cr_class = "green" if compliance_pct >= 80 else "red"
    cf_class = "green" if carbon_fitness_pct >= 80 else "amber"

    def badge(ok, partial=False):
        if ok:      return '<span class="badge green">&#10003; COMPLIANT</span>'
        if partial: return '<span class="badge amber">&#9889; PARTIAL</span>'
        return '<span class="badge red">&#10007; NON-COMPLIANT</span>'

    def row(label, value, b):
        return f'<tr><td class="label">{label}</td><td class="value">{value}</td><td>{b}</td></tr>'

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Helvetica Neue',Arial,sans-serif;background:#fff;color:#111;font-size:12px;padding:40px}}
h1{{font-size:22px;font-weight:800;margin-bottom:4px}}
.logo-line{{font-family:monospace;font-size:9px;color:#00a86b;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px}}
.report-header{{border:1px solid #ddd;border-radius:6px;padding:20px 24px;margin-bottom:16px}}
.report-header-top{{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}}
.framework{{text-align:right;font-family:monospace;font-size:10px;color:#888;line-height:2}}
.kpi-grid{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}}
.kpi-box{{background:#f8f8f8;border:1px solid #e8e8e8;border-radius:5px;padding:10px 12px}}
.kpi-lbl{{font-family:monospace;font-size:8px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}}
.kpi-val{{font-family:monospace;font-size:18px;font-weight:800}}
.green{{color:#00a86b}}.red{{color:#e84040}}.amber{{color:#c08000}}
.section{{border:1px solid #ddd;border-radius:6px;padding:18px 20px;margin-bottom:14px;page-break-inside:avoid}}
.section-code{{font-family:monospace;font-size:9px;color:#999;letter-spacing:2px}}
.section-title{{font-size:14px;font-weight:800}}
.section-sub{{font-family:monospace;font-size:9px;color:#aaa;margin-top:2px;margin-bottom:14px}}
table{{width:100%;border-collapse:collapse}}
tr{{border-bottom:1px solid #f0f0f0}}
td{{padding:8px 4px;vertical-align:middle}}
td.label{{color:#666;font-size:11px;width:44%}}
td.value{{font-family:monospace;font-size:11px;font-weight:700;color:#111;width:38%}}
.badge{{font-family:monospace;font-size:9px;font-weight:700;padding:2px 7px;border-radius:3px}}
.badge.green{{background:#e6f9f2;color:#00a86b;border:1px solid #00a86b44}}
.badge.amber{{background:#fff8e6;color:#c08000;border:1px solid #c0800044}}
.badge.red{{background:#fff0f0;color:#e84040;border:1px solid #e8404044}}
.compare-grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}}
.box-pass{{background:#f0fff8;border:1px solid #00a86b33;border-radius:6px;padding:12px}}
.box-fail{{background:#fff0f0;border:1px solid #e8404033;border-radius:6px;padding:12px}}
.box-lbl{{font-family:monospace;font-size:8px;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}}
.box-body{{font-family:monospace;font-size:10px;color:#555;line-height:2}}
.result{{font-family:monospace;font-size:10px;font-weight:700;margin-top:6px;padding:4px 6px;border-radius:3px}}
.result.pass{{background:#e6f9f2;color:#00a86b}}
.result.fail{{background:#fff0f0;color:#e84040}}
.reduction-grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px;background:#f8f8f8;border-radius:6px;padding:12px;border:1px solid #e8e8e8}}
.red-item{{text-align:center}}
.red-lbl{{font-family:monospace;font-size:8px;color:#aaa;margin-bottom:4px}}
.red-val{{font-family:monospace;font-size:16px;font-weight:800;color:#00a86b}}
.footer{{font-family:monospace;font-size:9px;color:#bbb;text-align:center;padding:20px 0 0;border-top:1px solid #eee;margin-top:8px}}
</style></head><body>
<div class="logo-line">INDO-SWISS GRANT &middot; SUSTAINOCPM</div>
<div class="report-header">
  <div class="report-header-top">
    <div>
      <div style="font-family:monospace;font-size:9px;color:#999;letter-spacing:2px;margin-bottom:6px">BUSINESS RESPONSIBILITY AND SUSTAINABILITY REPORT</div>
      <h1>SustainOCPM &mdash; Supply Chain ESG Disclosure</h1>
      <div style="font-family:monospace;font-size:10px;color:#999;margin-top:4px">Financial Year {fy} &middot; Generated {today} &middot; SEBI BRSR Format</div>
    </div>
    <div class="framework">GHG Protocol<br>SEBI BRSR Core<br>BEE (India) Norms<br>ISO 14064</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi-box"><div class="kpi-lbl">Total Orders</div><div class="kpi-val">{total_orders:,}</div></div>
    <div class="kpi-box"><div class="kpi-lbl">Compliance Rate</div><div class="kpi-val {cr_class}">{compliance_pct}%</div></div>
    <div class="kpi-box"><div class="kpi-lbl">Total CO&#8322;e</div><div class="kpi-val">{int(total_co2e/1000)}k kg</div></div>
    <div class="kpi-box"><div class="kpi-lbl">Total Violations</div><div class="kpi-val red">{violations:,}</div></div>
    <div class="kpi-box"><div class="kpi-lbl">Carbon Fitness</div><div class="kpi-val {cf_class}">{carbon_fitness_pct}%</div></div>
  </div>
</div>
<div class="section">
  <div class="section-code">SECTION A</div>
  <div class="section-title">General Disclosures</div>
  <div class="section-sub">Entity overview and supply chain profile</div>
  <table>
    {row("Reporting Entity","SustainOCPM &mdash; Louis India Supply Chain",badge(True))}
    {row("Reporting Period",f"FY {fy}",badge(True))}
    {row("Total Suppliers Monitored",str(total_suppliers),badge(True))}
    {row("Total Orders Tracked",f"{total_orders:,}",badge(True))}
    {row("Process Mining Framework","OCEL 2.0 &mdash; Object-Centric Event Log",badge(True))}
    {row("Carbon Attribution Method","ecoinvent EF &times; Supplier Carbon Intensity",badge(True))}
    {row("Conformance Engine","Dual-objective: Sequence + Carbon Budget",badge(True))}
  </table>
</div>
<div class="section">
  <div class="section-code">SECTION B</div>
  <div class="section-title">Management &amp; Process Governance</div>
  <div class="section-sub">Green process model and policy engine</div>
  <table>
    {row("Normative Process Model","Create Order &rarr; Goods Issue &rarr; Freight Booking &rarr; [Transport] &rarr; Warehouse &rarr; Customs &rarr; Delivery",badge(True))}
    {row("Air Freight Policy","POLICY-01: Absolute Ban (CRITICAL violation)",badge(True))}
    {row("Carbon Budget per Activity","7 activities with defined kg CO&#8322;e caps",badge(True))}
    {row("Supplier ESG Rating System","A&ndash;E scale, carbon intensity multiplier",badge(True))}
    {row("Automated Rerouting Engine","Sea Freight priority, urgent &rarr; Road Freight",badge(True))}
  </table>
</div>
<div class="section">
  <div class="section-code">SECTION C &mdash; PRINCIPLE 6</div>
  <div class="section-title">Environmental Responsibility &mdash; Scope 3 Emissions</div>
  <div class="section-sub">GHG Protocol Scope 3 &middot; Category 4 (Upstream Transportation)</div>
  <table>
    {row("Total Scope 3 CO&#8322;e",scope3_display,badge(compliance_pct>=80,compliance_pct>=50))}
    {row("Transport Share of Total","71.1%",badge(False,True))}
    {row("Air Freight Emissions Share",f"{air_pct}%",badge(air_pct<=30,air_pct<=50))}
    {row("Sea Freight Emissions Share",f"{sea_pct}%",badge(sea_pct>=40,sea_pct>=20))}
    {row("Average Emission per Order",f"{avg_emission} kg CO&#8322;e",badge(avg_emission<200,avg_emission<300))}
    {row("Carbon Fitness Score (Fleet)",f"{carbon_fitness_pct}%",badge(carbon_fitness_pct>=80,carbon_fitness_pct>=50))}
    {row("Conformance Compliance Rate",f"{compliance_pct}%",badge(compliance_pct>=80,compliance_pct>=60))}
  </table>
  <div class="reduction-grid">
    <div class="red-item"><div class="red-lbl">If Air &rarr; Sea (83% saving)</div><div class="red-val">{air_save_display}</div></div>
    <div class="red-item"><div class="red-lbl">Violations emission cost</div><div class="red-val">{int(violations * avg_emission / 1000):,}k kg</div></div>
    <div class="red-item"><div class="red-lbl">Compliance gap</div><div class="red-val">{round(100-compliance_pct,1)}% orders</div></div>
  </div>
</div>
<div class="section">
  <div class="section-code">SECTION C &mdash; PRINCIPLE 8</div>
  <div class="section-title">Supplier ESG Performance</div>
  <div class="section-sub">Carbon intensity ratings across supply chain</div>
  <table>
    {row("Total Suppliers Rated",str(total_suppliers),badge(True))}
    {row("A-rated Suppliers",str(a_rated),badge(True))}
    {row("E-rated Suppliers (Critical)",str(e_rated),badge(e_rated==0,e_rated<=5))}
    {row("Supplier ESG Coverage","100% of active suppliers",badge(True))}
    {row("Carbon Intensity Monitoring","Continuous &mdash; per-order attribution",badge(True))}
  </table>
</div>
<div class="section">
  <div class="section-code">SECTION D &mdash; RESEARCH EVIDENCE</div>
  <div class="section-title">Carbon-Aware Conformance Evidence</div>
  <div class="section-sub">Novel contribution: dual-objective fitness vs traditional sequence-only checking</div>
  <div class="compare-grid">
    <div class="box-pass">
      <div class="box-lbl">Traditional Process Mining</div>
      <div class="box-body">Create Order &rarr; Goods Issue &rarr;<br><span style="color:#c08000">Air Freight</span> &rarr; Delivery</div>
      <div class="result pass">&#10003; SEQUENCE: PASS</div>
    </div>
    <div class="box-fail">
      <div class="box-lbl">Carbon-Aware (This System)</div>
      <div class="box-body">Create Order &rarr; Goods Issue &rarr;<br><span style="color:#e84040">Air Freight (702 kg CO&#8322;e)</span> &rarr; Delivery</div>
      <div class="result fail">&#10007; CARBON: FAIL (budget 120 kg)</div>
    </div>
  </div>
  <table>
    {row("Dual-Objective Fitness Formula","0.5 &times; seq_fitness + 0.5 &times; carbon_fitness",badge(True))}
    {row("Carbon Fitness Formula","min(1, budget / actual_emission)",badge(True))}
    {row("Sequence Fitness Method","PM4Py token replay vs normative model",badge(True))}
    {row("OCEAn Gap Addressed","Conformance checking + automated rerouting",badge(True))}
    {row("BRSR Auto-Evidence Generation","This report",badge(True))}
  </table>
</div>
<div class="section">
  <div class="section-code">SECTION E</div>
  <div class="section-title">BRSR Disclosure Readiness Checklist</div>
  <div class="section-sub">SEBI-mandated disclosures for listed entities</div>
  <table>
    {row("Scope 3 Transport Emissions Data","&#10003; Available &mdash; per-order attribution",badge(True))}
    {row("Supplier ESG Scores","&#10003; A&ndash;E Rating with carbon intensity",badge(True))}
    {row("Carbon Budget Conformance per Order","&#10003; Dual-objective fitness computed",badge(True))}
    {row("Carbon Fitness Score","&#10003; Fleet-level CEI computed",badge(True))}
    {row("Green Process Model","&#10003; Normative sequence defined",badge(True))}
    {row("Automated Rerouting Suggestions","&#10003; Sea/Road Freight alternative paths",badge(True))}
    {row("Process Variant Analysis","&#9889; Partial &mdash; variants identified, not clustered",badge(False,True))}
    {row("OCEL 2.0 Full Object Graph","&#9889; Events + traces &mdash; object relations pending",badge(False,True))}
    {row("Distance-based Carbon Attribution","&#10007; Planned &mdash; Phase 4",badge(False,False))}
    {row("Celonis Integration","&#10007; Planned",badge(False,False))}
  </table>
</div>
<div class="footer">Generated by SustainOCPM &middot; Indo-Swiss Grant &middot; OCEL 2.0 Carbon-Aware Conformance Engine &middot; {today}</div>
</body></html>"""

    buf = BytesIO()
    pisa.CreatePDF(html, dest=buf)
    tmp_dir  = tempfile.mkdtemp()
    pdf_path = os.path.join(tmp_dir, "brsr_report.pdf")
    with open(pdf_path, "wb") as f:
        f.write(buf.getvalue())

    filename = f"BRSR_Report_{date.today().isoformat()}.pdf"
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/debug")
def debug():
    return {"file": __file__}
