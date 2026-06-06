"""
engine/parser.py
Parses the SustainOCPM CSV event log into structured traces.

CSV columns expected:
  event_id, order_id, supplier_id, activity, timestamp,
  carbon_factor, carbon_budget, supplier_rating,
  transport_type, violation_type
"""

import csv
import io
from collections import defaultdict


NORMATIVE_SEQUENCE = [
    "Create Order",
    "Supplier Selection",
    "Goods Issue",
   
    # any one of: Sea Freight | Air Freight | Road Freight
    "Warehouse Transfer",
    "Customs Clearance",
    "Delivery",
]


TRANSPORT_ACTIVITIES = {"Sea Freight", "Air Freight", "Road Freight"}

EMISSION_FACTORS = {
    "Create Order": 1,
    "Supplier Selection": 2,
    "Goods Issue": 5,
    "Freight Booking": 20,
    "Air Freight": 300,
    "Road Freight": 120,
    "Sea Freight": 50,
    "Warehouse Transfer": 20,
    "Customs Clearance": 15,
    "Delivery": 10,
}


def parse_csv(content: bytes) -> list[dict]:
    """
    Parse raw CSV bytes into a list of event dicts.
    Returns [] on empty or malformed input.
    """
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    events = []
    for row in reader:
        try:
            events.append({
                "event_id":       row["event_id"].strip(),
                "order_id":       row["order_id"].strip(),
                "supplier_id":    row["supplier_id"].strip(),
                "activity":       row["activity"].strip(),
                "timestamp":      row["timestamp"].strip(),
                "carbon_factor":  float(row["carbon_factor"] or 0),
                "carbon_budget":  float(row["carbon_budget"] or 300),
                "supplier_rating": row["supplier_rating"].strip(),
                "transport_type": row.get("transport_type", "").strip(),
                "violation_type": row.get("violation_type", "").strip(),
            })
        except (KeyError, ValueError):
            continue
    return events


def build_traces(events: list[dict]) -> dict[str, list[dict]]:
    """
    Group events by order_id into traces.
    Each trace is a list of events sorted by timestamp.
    """
    traces = defaultdict(list)
    for e in events:
        traces[e["order_id"]].append(e)
    # sort each trace by timestamp string (ISO format sorts lexicographically)
    for oid in traces:
        traces[oid].sort(key=lambda e: e["timestamp"])
    return dict(traces)


def trace_summary(events: list[dict]) -> dict:
    """
    Compute per-trace summary used by the conformance engine.
    """
    if not events:
        return {}

    order_id      = events[0]["order_id"]
    supplier_id   = events[0]["supplier_id"]
    supplier_rating = events[0]["supplier_rating"]
    carbon_budget = events[0]["carbon_budget"]

    total_emission = sum(
    e["carbon_factor"]
    for e in events
)
    activities     = [e["activity"] for e in events]
    transport_used = next(
        (e["transport_type"] for e in events if e["transport_type"] in TRANSPORT_ACTIVITIES),
        "Unknown"
    )

    carbon_fitness = round(min(1.0, carbon_budget / total_emission), 4) if total_emission > 0 else 1.0
    carbon_ok      = total_emission <= carbon_budget

    # sequence fitness via token replay
    # For single-event traces (one transport activity only), treat as a valid
    # partial log rather than a full-sequence failure — the CSV format records
    # one transport event per order, so missing process steps are expected.
    is_single_transport_trace = (
        len(activities) == 1 and activities[0] in TRANSPORT_ACTIVITIES
    )
    if is_single_transport_trace:
        seq_fitness = 1.0
        missing = []
        extra = []
    else:
        seq_fitness, missing, extra = token_replay(activities)

    has_violation = any(
        str(e.get("violation_type", "")).strip().upper() not in ("", "NONE", "COMPLIANT")
        for e in events
    )

    violation_type = next(
        (
            str(e.get("violation_type", "")).strip().upper()
            for e in events
            if str(e.get("violation_type", "")).strip().upper() not in ("", "NONE", "COMPLIANT")
        ),
        ""
    )

    # Normalise violation_type to standard labels used by conformance checker
    _vt = violation_type.lower()
    if "carbon" in _vt:
        violation_type = "Carbon Violation"
    elif "process" in _vt:
        violation_type = "Process Violation"
    elif "data" in _vt:
        violation_type = "Data Quality Issue"
    elif violation_type:
        violation_type = "Carbon Violation"  # fallback for unknown non-empty types

    return {
        "order_id":        order_id,
        "supplier_id":     supplier_id,
        "supplier_rating": supplier_rating,
        "carbon_budget":   carbon_budget,
        "total_emission":  round(total_emission, 2),
        "carbon_fitness":  carbon_fitness,
        "carbon_ok":       carbon_ok,
        "activities":      activities,
        "transport_used":  transport_used,
        "seq_fitness":     seq_fitness,
        "missing_steps":   missing,
        "extra_steps":     extra,
        "has_violation":   has_violation,
        "violation_type":  violation_type,
        "event_count":     len(events),
    }


def token_replay(activities: list[str]) -> tuple[float, list[str], list[str]]:
    """
    Simple token replay against NORMATIVE_SEQUENCE.
    Transport activities are treated as a single optional slot.
    Returns (fitness_score 0–1, missing_steps, extra_steps).
    """
    norm = [
        s for s in NORMATIVE_SEQUENCE
    ]

    # normalise: collapse transport variants into one slot label
    def normalise(act):
        return "Freight" if act in TRANSPORT_ACTIVITIES else act

    actual_norm   = [normalise(a) for a in activities]
    expected_norm = [normalise(s) for s in norm]

    # greedy left-to-right matching
    matched  = 0
    ptr      = 0
    for step in expected_norm:
        while ptr < len(actual_norm):
            if actual_norm[ptr] == step:
                matched += 1
                ptr += 1
                break
            ptr += 1

    total    = len(expected_norm)
    fitness  = round(matched / total, 4) if total > 0 else 1.0

    matched_set = set(expected_norm) & set(actual_norm)
    missing     = [s for s in expected_norm if s not in matched_set]
    extra       = [a for a in actual_norm  if a not in set(expected_norm)]

    return fitness, missing, extra


def aggregate_stats(summaries: list[dict]) -> dict:
    """
    Aggregate trace summaries into dataset-level stats.
    """
    if not summaries:
        return {}

    n              = len(summaries)
    compliant_count = sum(1 for s in summaries if not s["has_violation"])

    # Use carbon_ok as single source of truth (avoids double-counting with violation_type)
    carbon_violations = sum(
        1 for s in summaries
        if not s["carbon_ok"]
    )

    seq_violations = sum(
        1 for s in summaries
        if "process" in s.get("violation_type", "").lower()
        or (s["seq_fitness"] < 1.0 and not (
            len(s.get("activities", [])) == 1
            and s.get("activities", [""])[0] in TRANSPORT_ACTIVITIES
        ))
    )

    data_violations = sum(
        1 for s in summaries
        if "data" in s.get("violation_type", "").lower()
    )
    avg_carbon_fit    = round(sum(s["carbon_fitness"] for s in summaries) / n, 4)
    avg_seq_fit       = round(sum(s["seq_fitness"]     for s in summaries) / n, 4)
    total_emission    = round(sum(s["total_emission"]   for s in summaries), 2)

    transport_counts = defaultdict(int)
    for s in summaries:
        transport_counts[s["transport_used"]] += 1

    total_violations = carbon_violations + seq_violations + data_violations
    return {
        "total_traces":        n,
        "carbon_violations":   carbon_violations,
        "process_violations":  seq_violations,
        "seq_violations":      seq_violations,
        "data_violations":     data_violations,
        "compliance_rate": round(compliant_count / n * 100, 2),
        "avg_carbon_fitness":  avg_carbon_fit,
        "avg_seq_fitness":     avg_seq_fit,
        "total_emission":      total_emission,
        "transport_breakdown": dict(transport_counts),
    }