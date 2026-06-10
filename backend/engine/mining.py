import pandas as pd
from collections import Counter, defaultdict

def compute_insights(events):
    df = pd.DataFrame(events)
    grouped = df.groupby("activity").agg({
        "cost": "mean",
        "emission": "mean",
        "time": "mean"
    }).reset_index()
    grouped["score"] = grouped["emission"] * grouped["time"]
    bottleneck = grouped.loc[grouped["score"].idxmax()].to_dict()
    return {
        "insights": grouped.to_dict(orient="records"),
        "bottleneck": bottleneck
    }


def cluster_variants(traces: dict) -> dict:
    """
    traces: {order_id: [event_dict, ...]}  — from build_traces()
    Each event_dict must have: activity, carbon_factor, transport_type (optional)
    """
    variant_counts   = Counter()
    variant_emissions = defaultdict(list)
    variant_transport = defaultdict(set)

    for order_id, events in traces.items():
        sorted_events = sorted(events, key=lambda e: e.get("timestamp", ""))
        variant = tuple(e["activity"] for e in sorted_events)
        total_emit = sum(float(e.get("carbon_factor", 0)) for e in sorted_events)
        transport = next(
            (e.get("transport_type", "") for e in sorted_events if e.get("transport_type")),
            "Unknown"
        )
        variant_counts[variant] += 1
        variant_emissions[variant].append(total_emit)
        variant_transport[variant].add(transport)

    total_traces = sum(variant_counts.values())

    results = []
    for rank, (variant, count) in enumerate(variant_counts.most_common(20), 1):
        emits = variant_emissions[variant]
        avg_emit = round(sum(emits) / len(emits), 2) if emits else 0
        results.append({
            "rank":            rank,
            "variant":         list(variant),
            "variant_str":     " → ".join(variant),
            "count":           count,
            "frequency_pct":   round(count / total_traces * 100, 2),
            "avg_emission_kg": avg_emit,
            "min_emission_kg": round(min(emits), 2) if emits else 0,
            "max_emission_kg": round(max(emits), 2) if emits else 0,
            "transport_modes": list(variant_transport[variant]),
            "is_normative":    _is_normative(list(variant)),
            "step_count":      len(variant),
        })

    return {
        "total_traces":   total_traces,
        "unique_variants": len(variant_counts),
        "top_variants":   results,
    }


_NORMATIVE = {
    "Create Order", "Goods Issue", "Freight Booking",
    "Warehouse Transfer", "Customs Clearance", "Delivery"
}
_TRANSPORT = {"Sea Freight", "Road Freight", "Air Freight"}

def _is_normative(variant: list) -> bool:
    """True if the variant contains all mandatory steps and only allowed transport."""
    acts = set(variant)
    mandatory_ok = _NORMATIVE.issubset(acts)
    transport_used = acts & _TRANSPORT
    transport_ok = bool(transport_used) and not bool(transport_used & {"Air Freight"})
    return mandatory_ok and transport_ok
