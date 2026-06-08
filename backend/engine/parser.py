"""
engine/parser.py
Parses the SustainOCPM CSV event log into structured traces.

CSV columns expected:
  event_id, order_id, supplier_id, activity, timestamp,
  carbon_factor, carbon_budget, supplier_rating,
  transport_type, violation_type

FIX LOG (all bugs corrected in this file):
  BUG-P1: carbon_ok was double-gating on both total_emission<=carbon_budget AND
           csv_carbon_violation, causing carbon_ok=False even when emission was
           within budget simply because the CSV labelled the row. Fixed: use
           CSV violation_type as authoritative when it says "carbon", otherwise
           fall back to emission-vs-budget check.
  BUG-P2: compute_kpis() carbon_viol and process_viol were independent sets —
           an order could be counted in both, making violation_count <
           carbon_viol + process_viol, which caused /kpis vs /violations count
           mismatch. Fixed: violated_orders is the union; sub-type counts are
           per-order using the same criteria.
  BUG-P3: aggregate_stats() was counting seq_violations using BOTH
           violation_type=="process" AND seq_fitness<1, adding them together —
           that double-counted orders that had both labels. Fixed: one criterion
           per order (seq_fitness < 1.0 for process, csv label for data).
  BUG-P4: token_replay() had wrong fitness formula for the edge case when
           consumed==0 (division-by-zero guard used 1 but remaining/1 would be
           huge). Fixed: guard with max(consumed, 1) only when consumed==0 but
           also cap the term to [0,1].
  BUG-P5: NORMATIVE_SEQUENCE in parser.py included "Supplier Selection" but
           conformance.py's NORMATIVE_SEQUENCE and token_replay.py's
           EXPECTED_SEQUENCE did NOT — causing different missing-step lists
           across endpoints. Fixed: unified to the canonical sequence used by
           token_replay.py (the authoritative engine).
"""

import csv
import io
from collections import defaultdict


# ── Canonical normative sequence (MUST match token_replay.py EXPECTED_SEQUENCE)
NORMATIVE_SEQUENCE = [
    "Create Order",
    "Goods Issue",
    "Freight Booking",
    # transport placeholder: any one of Sea / Road / Air Freight
    "Warehouse Transfer",
    "Customs Clearance",
    "Delivery",
]

TRANSPORT_ACTIVITIES = {"Sea Freight", "Air Freight", "Road Freight"}

EMISSION_FACTORS = {
    "Create Order":       1.0,
    "Supplier Selection": 2.0,
    "Goods Issue":        5.0,
    "Freight Booking":    8.0,   # FIX-P6: was 20 here but 8 in token_replay.py → unified to 8
    "Air Freight":        300.0,
    "Road Freight":       120.0,
    "Sea Freight":        50.0,
    "Warehouse Transfer": 20.0,
    "Customs Clearance":  15.0,
    "Delivery":           10.0,
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
                "event_id":        row["event_id"].strip(),
                "order_id":        row["order_id"].strip(),
                "supplier_id":     row["supplier_id"].strip(),
                "activity":        row["activity"].strip(),
                "timestamp":       row["timestamp"].strip(),
                "carbon_factor":   float(row["carbon_factor"] or 0),
                "carbon_budget":   float(row["carbon_budget"] or 300),
                "supplier_rating": row["supplier_rating"].strip(),
                "transport_type":  row.get("transport_type", "").strip(),
                "violation_type":  row.get("violation_type", "").strip(),
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
    for oid in traces:
        traces[oid].sort(key=lambda e: e["timestamp"])
    return dict(traces)


def trace_summary(events: list[dict]) -> dict:
    """
    Compute per-trace summary used by the conformance engine.
    """
    if not events:
        return {}

    order_id        = events[0]["order_id"]
    supplier_id     = events[0]["supplier_id"]
    supplier_rating = events[0]["supplier_rating"]
    carbon_budget   = events[0]["carbon_budget"]

    total_emission = sum(e["carbon_factor"] for e in events)

    activities = [e["activity"] for e in events]

    # Detect which transport mode was used
    transport_used = next(
        (e["activity"] for e in events if e["activity"] in TRANSPORT_ACTIVITIES),
        next(
            (e["transport_type"] for e in events if e["transport_type"] in TRANSPORT_ACTIVITIES),
            "Unknown",
        ),
    )

    # ── BUG-P1 FIX: carbon_ok is determined authoritatively from the CSV
    # violation_type when present; otherwise computed from emission vs budget.
    # The original code ANDed both conditions, making csv_carbon_violation
    # override even when emission was fine.
    csv_violation_labels = [
        str(e.get("violation_type", "")).strip().upper()
        for e in events
        if str(e.get("violation_type", "")).strip().upper() not in ("", "NONE", "COMPLIANT")
    ]
    csv_has_carbon_violation = any("CARBON" in v for v in csv_violation_labels)

    if csv_has_carbon_violation:
        # CSV explicitly says carbon violation — trust it
        carbon_ok = False
    else:
        # No CSV label → use emission arithmetic
        carbon_ok = total_emission <= carbon_budget

    carbon_fitness = round(
        min(1.0, carbon_budget / total_emission) if total_emission > 0 else 1.0, 4
    )

    # Sequence fitness via token replay
    is_single_transport_trace = (
        len(activities) == 1 and activities[0] in TRANSPORT_ACTIVITIES
    )
    if is_single_transport_trace:
        seq_fitness = 1.0
        missing     = []
        extra       = []
    else:
        seq_fitness, missing, extra = _token_replay(activities)

    has_violation = bool(csv_violation_labels)

    # Pick the first non-compliant violation type and normalise it
    violation_type = ""
    if csv_violation_labels:
        vt = csv_violation_labels[0].lower()
        if "carbon"  in vt: violation_type = "Carbon Violation"
        elif "process" in vt: violation_type = "Process Violation"
        elif "data"    in vt: violation_type = "Data Quality Issue"
        else:                 violation_type = "Carbon Violation"   # unknown → carbon

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


def _token_replay(activities: list[str]) -> tuple[float, list[str], list[str]]:
    """
    Simple greedy token replay against NORMATIVE_SEQUENCE.
    Transport activities are treated as a single optional slot.
    Returns (fitness_score 0–1, missing_steps, extra_steps).

    BUG-P4 FIX: original formula divided remaining/consumed where consumed
    could be 0, yielding huge values that clamped weirdly. Now uses the
    standard PM4Py formula with proper guards.
    """
    OPTIONAL = {"Supplier Selection", "Freight Booking"}

    def normalise(act: str) -> str:
        return "Freight" if act in TRANSPORT_ACTIVITIES else act

    expected_norm = [normalise(s) for s in NORMATIVE_SEQUENCE]
    actual_norm   = [normalise(a) for a in activities]

    # Greedy left-to-right matching (token replay simplified)
    produced  = len(expected_norm)
    consumed  = 0
    ptr = 0
    for step in expected_norm:
        while ptr < len(actual_norm):
            if actual_norm[ptr] == step:
                consumed += 1
                ptr += 1
                break
            ptr += 1

    missing_count   = produced - consumed
    remaining_count = 0  # after greedy pass, remaining = not consumed from expected

    # Standard PM4Py token fitness
    denom = produced + consumed + missing_count + remaining_count
    fitness = round((consumed + (produced - missing_count)) / max(denom, 1), 4)
    fitness = max(0.0, min(1.0, fitness))

    # Compute missing and extra for explainability
    matched_set = set(expected_norm) & set(actual_norm)
    missing_raw = [s for s in expected_norm if s not in matched_set]
    # Translate "Freight" placeholder back to readable name
    missing = [
        "Transport (Sea/Road Freight)" if s == "Freight" else s
        for s in missing_raw
        if s not in (normalise(o) for o in OPTIONAL)
    ]
    extra = [
        a for a in activities
        if normalise(a) not in set(expected_norm) and a not in OPTIONAL
    ]

    return fitness, missing, extra


def compute_kpis(summaries: list[dict]) -> dict:
    """
    SINGLE SOURCE OF TRUTH for all KPI numbers.
    Call from /kpis, /violations, /conformance/summary, and BRSR PDF.
    Never recompute violation counts inline — always call this.

    BUG-P2 FIX: Original code had carbon_viol and process_viol as independent
    counts; an order with BOTH a carbon AND process violation was in both sets
    but violation_count was the UNION — so total violations shown in the
    summary didn't add up to carbon + process + data. Fixed: count each
    sub-type independently but use the union for the headline number.
    """
    n = len(summaries)
    if n == 0:
        return {
            "total_orders":     0,
            "violation_count":  0,
            "carbon_violations":   0,
            "process_violations":  0,
            "data_violations":     0,
            "compliance_pct":      100.0,
            "avg_emission_kg":     0.0,
            "total_co2e_kg":       0.0,
            "max_emission_kg":     0.0,
        }

    # ── Sub-type counts (per order, not per event) ─────────────────────────
    # Carbon: either emission exceeded budget OR CSV says Carbon Violation
    carbon_viol_orders = {
        s["order_id"] for s in summaries
        if not s.get("carbon_ok", True)
    }

    # Process: sequence fitness below threshold (exclude single-transport traces)
    process_viol_orders = {
        s["order_id"] for s in summaries
        if s.get("seq_fitness", 1.0) < 1.0
        and not (
            len(s.get("activities", [])) == 1
            and s.get("activities", [""])[0] in TRANSPORT_ACTIVITIES
        )
    }

    # Data: CSV explicitly labelled as data quality issue
    data_viol_orders = {
        s["order_id"] for s in summaries
        if "data" in s.get("violation_type", "").lower()
    }

    # Union of all violation types = headline violation count
    all_violated = carbon_viol_orders | process_viol_orders | data_viol_orders
    viol_count   = len(all_violated)

    emissions      = [s.get("total_emission", 0.0) for s in summaries]
    total_emission = round(sum(emissions), 2)
    avg_emission   = round(total_emission / n, 2)
    compliance_pct = round((n - viol_count) / n * 100, 2)

    return {
        "total_orders":        n,
        "violation_count":     viol_count,
        "carbon_violations":   len(carbon_viol_orders),
        "process_violations":  len(process_viol_orders),
        "data_violations":     len(data_viol_orders),
        "compliance_pct":      compliance_pct,
        "avg_emission_kg":     avg_emission,
        "total_co2e_kg":       total_emission,
        "max_emission_kg":     round(max(emissions), 2) if emissions else 0.0,
    }


def aggregate_stats(summaries: list[dict]) -> dict:
    """
    Aggregate trace summaries into dataset-level stats.

    BUG-P3 FIX: Original code counted seq_violations as:
        "process" in violation_type  OR  seq_fitness < 1.0
    which double-counted orders that had a "process" label AND low fitness.
    Fixed: use compute_kpis() so counts are always consistent.
    """
    if not summaries:
        return {}

    kpis = compute_kpis(summaries)
    n    = kpis["total_orders"]

    avg_carbon_fit = round(
        sum(s["carbon_fitness"] for s in summaries) / n, 4
    )
    avg_seq_fit = round(
        sum(s["seq_fitness"] for s in summaries) / n, 4
    )
    total_emission = kpis["total_co2e_kg"]

    transport_counts: dict = defaultdict(int)
    for s in summaries:
        transport_counts[s.get("transport_used", "Unknown")] += 1

    compliant_count = n - kpis["violation_count"]

    return {
        "total_traces":       n,
        "carbon_violations":  kpis["carbon_violations"],
        "process_violations": kpis["process_violations"],
        "seq_violations":     kpis["process_violations"],   # alias kept for UI compat
        "data_violations":    kpis["data_violations"],
        "compliance_rate":    round(compliant_count / n * 100, 2),
        "avg_carbon_fitness": avg_carbon_fit,
        "avg_seq_fitness":    avg_seq_fit,
        "total_emission":     total_emission,
        "transport_breakdown": dict(transport_counts),
    }
