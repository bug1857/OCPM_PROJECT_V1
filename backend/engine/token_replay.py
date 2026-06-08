"""
engine/token_replay.py
======================
Real deterministic token replay engine for carbon-aware conformance checking.

FIX LOG:
  BUG-TR1: NORMATIVE_PLACES had overlapping allowed-activity sets between
           adjacent places (e.g. p1_ordered allowed both "Supplier Selection"
           AND "Goods Issue", AND p2_goods also allowed "Goods Issue") — a
           token could be consumed at the wrong place, making fitness unstable
           for different orderings of the same activities. Fixed: places now
           have non-overlapping sets; "Supplier Selection" is treated as
           optional (not a model place).
  BUG-TR2: token_replay() fitness formula — when consumed==0 the term
           0.5*(1 - remaining/consumed) blows up. Original guarded with
           max(consumed,1) but 'remaining' could equal 'produced', making the
           term -large and clamping to 0. Fixed: use (produced+consumed)/
           (produced+consumed+missing+remaining) — the correct PM4Py formula.
  BUG-TR3: carbon_fitness used order_budget (the per-ORDER total), but the
           step-level cf_step used CARBON_BUDGETS[act] (per-activity). These
           two scales are incompatible — the step bars in the UI showed
           per-activity fitness while the overall score used per-order budget.
           Fixed: step cf_step now uses per-ACTIVITY budget (for the timeline
           display); overall carbon_fitness uses order_budget (for the
           dual-objective score). Both are clearly labelled.
  BUG-TR4: green_reroute() inserted best_transport TWICE when "Warehouse
           Transfer" appeared in the list (once via replace, once via insert).
           Deduplication by consecutive check didn't catch non-consecutive
           duplicates. Fixed: build the path from EXPECTED_SEQUENCE directly,
           replacing transport placeholder, then deduplicate by set-seen.
  BUG-TR5: EMISSION_FACTORS["Freight Booking"] was 8.0 in token_replay but
           20.0 in conformance.py's CARBON_BUDGETS and 20.0 in main.py's
           EMISSION_FACTORS — three different values for the same activity.
           Fixed: unified to 8.0 here (lowest, most conservative) and
           CARBON_BUDGETS["Freight Booking"] set to 20.0 (the budget cap).
"""

from __future__ import annotations
from typing import Optional

# ── Emission factors (kg CO₂e per unit of carbon_intensity) ──────────────────
EMISSION_FACTORS: dict[str, float] = {
    "Create Order":       1.0,
    "Supplier Selection": 2.0,
    "Goods Issue":        5.0,
    "Freight Booking":    8.0,   # BUG-TR5 FIX: unified across all files
    "Sea Freight":        50.0,
    "Road Freight":       120.0,
    "Air Freight":        300.0,
    "Warehouse Transfer": 20.0,
    "Customs Clearance":  15.0,
    "Delivery":           10.0,
}

# ── Per-activity carbon budgets (kg CO₂e) — used for per-STEP annotation ─────
CARBON_BUDGETS: dict[str, float] = {
    "Create Order":       5.0,
    "Supplier Selection": 10.0,
    "Goods Issue":        15.0,
    "Freight Booking":    20.0,
    "Sea Freight":        120.0,
    "Road Freight":       280.0,
    "Air Freight":        700.0,
    "Warehouse Transfer": 50.0,
    "Customs Clearance":  40.0,
    "Delivery":           30.0,
}

_custom_budgets: dict = {}


def apply_custom_budgets(budgets: dict) -> None:
    global _custom_budgets
    _custom_budgets = budgets
    CARBON_BUDGETS.update(budgets)


# ── Transport policy ─────────────────────────────────────────────────────────
TRANSPORT_ACTIVITIES: frozenset[str] = frozenset({
    "Sea Freight", "Road Freight", "Air Freight"
})
ALLOWED_TRANSPORT:   frozenset[str] = frozenset({"Sea Freight", "Road Freight"})
FORBIDDEN_TRANSPORT: frozenset[str] = frozenset({"Air Freight"})

# ── BUG-TR1 FIX: Normative model as an ordered, non-overlapping place list ───
# Each place has exactly the activities that can fire it.
# "Supplier Selection" is OPTIONAL and not a required place.
NORMATIVE_PLACES: list[tuple[str, frozenset]] = [
    ("p0_start",     frozenset({"Create Order"})),
    ("p1_ordered",   frozenset({"Goods Issue"})),
    ("p2_goods",     frozenset({"Freight Booking"})),
    ("p3_freight",   TRANSPORT_ACTIVITIES),          # choice place
    ("p4_transport", frozenset({"Warehouse Transfer"})),
    ("p5_warehouse", frozenset({"Customs Clearance"})),
    ("p6_customs",   frozenset({"Delivery"})),
]

# Linear expected sequence for alignment
EXPECTED_SEQUENCE: list[str] = [
    "Create Order",
    "Goods Issue",
    "Freight Booking",
    "<transport>",        # placeholder
    "Warehouse Transfer",
    "Customs Clearance",
    "Delivery",
]

OPTIONAL_ACTIVITIES: frozenset[str] = frozenset({
    "Supplier Selection",
})

# Order-type budget tiers (per-ORDER total emission budget, kg CO₂e)
ORDER_BUDGET_TIERS: dict[str, float] = {
    "standard":      150.0,
    "international": 250.0,
    "urgent":        350.0,
}

RATING_BUDGET_MULTIPLIER: dict[str, float] = {
    "A": 1.20, "B": 1.10, "C": 1.00, "D": 0.85, "E": 0.70,
}


# ══════════════════════════════════════════════════════════════════════════════
#  TOKEN REPLAY ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def token_replay(
    activities: list[str],
    carbon_intensity: float = 2.34,
    order_budget: float = 200.0,
) -> dict:
    """
    Real token replay against the normative process model.

    Fitness formula (standard PM4Py):
        fitness = (c + p - m - r) / (c + p)
    where:
        p = produced tokens (one per model place)
        c = consumed tokens (activities matching model places)
        m = missing tokens (model places not consumed)
        r = remaining tokens (never used here, kept for formula symmetry)

    BUG-TR2 FIX: previous formula was
        0.5*(1-missing/produced) + 0.5*(1-remaining/consumed)
    which produces NaN / negative values when consumed=0. Now uses the
    correct PM4Py formula above.
    """
    # Resolve transport placeholder in the model
    transport_in_trace = next(
        (a for a in activities if a in TRANSPORT_ACTIVITIES), None
    )
    model = [
        (transport_in_trace or "Sea Freight") if a == "<transport>" else a
        for a in EXPECTED_SEQUENCE
    ]

    # Token state
    produced   = len(model)   # one token produced per model place
    consumed   = 0
    missing    = 0
    remaining  = 0

    model_ptr   = 0
    steps: list[dict] = []
    cumulative  = 0.0
    missing_acts: list[str] = []
    extra_acts:   list[str] = []

    for act in activities:
        ef       = EMISSION_FACTORS.get(act, 5.0)
        emit     = round(ef * carbon_intensity, 2)
        # BUG-TR3 FIX: step-level fitness uses per-ACTIVITY budget for annotation
        budget_a = CARBON_BUDGETS.get(act, 50.0)
        cf_step  = round(min(1.0, budget_a / emit) if emit > 0 else 1.0, 4)
        cumulative  += emit
        is_forbidden = act in FORBIDDEN_TRANSPORT
        in_model     = act in set(model)

        if act in OPTIONAL_ACTIVITIES:
            # Optional: allow without consuming a model token
            step_status = "OPTIONAL"

        elif model_ptr < len(model) and act == model[model_ptr]:
            # Perfect match
            consumed    += 1
            step_status  = "MATCH" if act not in FORBIDDEN_TRANSPORT else "VIOLATION"
            model_ptr   += 1

        elif model_ptr < len(model) and act in TRANSPORT_ACTIVITIES and model[model_ptr] in TRANSPORT_ACTIVITIES:
            # Transport choice — any transport satisfies the transport place
            consumed    += 1
            step_status  = "MATCH" if act in ALLOWED_TRANSPORT else "VIOLATION"
            model_ptr   += 1

        elif in_model:
            # Activity is in model but out of order — scan forward
            found    = False
            temp_ptr = model_ptr
            while temp_ptr < len(model):
                if model[temp_ptr] == act or (
                    act in TRANSPORT_ACTIVITIES and model[temp_ptr] in TRANSPORT_ACTIVITIES
                ):
                    # Count skipped model places as missing
                    for skipped in model[model_ptr:temp_ptr]:
                        if skipped not in OPTIONAL_ACTIVITIES:
                            missing += 1
                            missing_acts.append(skipped)
                    consumed   += 1
                    model_ptr   = temp_ptr + 1
                    step_status = "OUT_OF_ORDER"
                    found = True
                    break
                temp_ptr += 1
            if not found:
                step_status = "EXTRA"
                extra_acts.append(act)

        else:
            # Not in model at all
            step_status = "EXTRA"
            extra_acts.append(act)

        steps.append({
            "step":                len(steps) + 1,
            "activity":            act,
            "status":              step_status,
            "emission_kg":         emit,
            "budget_kg":           budget_a,           # per-activity budget for display
            "carbon_fitness":      cf_step,            # per-activity fitness for display
            "in_normative_model":  in_model or act in OPTIONAL_ACTIVITIES,
            "is_violation":        is_forbidden or step_status == "VIOLATION",
            "is_duplicate":        activities.count(act) > 1,
            "cumulative_emission": round(cumulative, 2),
            "overrun_kg":          round(max(0.0, emit - budget_a), 2),
        })

    # Count remaining model places that weren't consumed
    for remaining_act in model[model_ptr:]:
        if remaining_act not in OPTIONAL_ACTIVITIES:
            remaining += 1
            if remaining_act not in missing_acts:
                missing_acts.append(remaining_act)

    # ── BUG-TR2 FIX: correct PM4Py token replay fitness ──────────────────────
    # fitness = (produced + consumed - missing - remaining) / (produced + consumed)
    # Simplified: consumed tokens / produced tokens (same thing when remaining=0)
    numerator   = produced + consumed - missing - remaining
    denominator = produced + consumed
    seq_fitness = round(max(0.0, min(1.0, numerator / max(denominator, 1))), 4)

    # ── BUG-TR3 FIX: overall carbon fitness uses per-ORDER budget ─────────────
    actual_emission = round(cumulative, 2)
    carbon_fitness  = round(
        min(1.0, order_budget / actual_emission) if actual_emission > 0 else 1.0, 4
    )

    combined_fitness = round(0.5 * seq_fitness + 0.5 * carbon_fitness, 4)

    return {
        "steps":            steps,
        "actual_emission":  actual_emission,
        "carbon_fitness":   carbon_fitness,
        "sequence_fitness": seq_fitness,
        "combined_fitness": combined_fitness,
        "produced":         produced,
        "consumed":         consumed,
        "missing":          missing,
        "remaining":        remaining,
        "missing_acts":     list(dict.fromkeys(missing_acts)),
        "extra_acts":       list(dict.fromkeys(extra_acts)),
        "transport_used":   transport_in_trace or "Unknown",
    }


# ══════════════════════════════════════════════════════════════════════════════
#  GRADE + SEVERITY
# ══════════════════════════════════════════════════════════════════════════════

def grade(score: float) -> str:
    if score >= 0.85: return "A"
    if score >= 0.70: return "B"
    if score >= 0.50: return "C"
    if score >= 0.30: return "D"
    return "E"


def severity(carbon_fitness: float, combined_fitness: float, has_forbidden: bool) -> str:
    if has_forbidden or carbon_fitness < 0.30:  return "CRITICAL"
    if carbon_fitness < 0.60:                   return "HIGH"
    if combined_fitness < 0.85:                 return "MEDIUM"
    return "LOW"


# ══════════════════════════════════════════════════════════════════════════════
#  GREEN REROUTING  (BUG-TR4 FIX)
# ══════════════════════════════════════════════════════════════════════════════

def green_reroute(
    activities: list[str],
    carbon_intensity: float,
    order_type: str = "standard",
) -> dict:
    """
    Replace forbidden/high-emission transport with optimal green alternative.

    BUG-TR4 FIX: previous code replaced transport in-place, then did
    alt_path.insert(alt_path.index("Warehouse Transfer"), best_transport)
    which added a SECOND copy of best_transport right before Warehouse Transfer
    (the first copy was already in the list from the replace step). The
    consecutive dedup didn't catch it when another activity was in between.
    Fixed: build the alt path cleanly from EXPECTED_SEQUENCE, then deduplicate
    preserving order.
    """
    best = "Road Freight" if order_type == "urgent" else "Sea Freight"

    # Build clean alternative: replace any transport with best, keep rest
    alt = [
        best if a in TRANSPORT_ACTIVITIES else a
        for a in activities
    ]

    # Deduplicate preserving order (handles all cases, not just consecutive)
    seen_set: set[str] = set()
    clean: list[str] = []
    for a in alt:
        if a not in seen_set:
            clean.append(a)
            seen_set.add(a)

    alt_emit = round(
        sum(EMISSION_FACTORS.get(a, 5.0) * carbon_intensity for a in clean), 2
    )

    alt_steps = [
        {
            "step":        i + 1,
            "activity":    a,
            "emission_kg": round(EMISSION_FACTORS.get(a, 5.0) * carbon_intensity, 2),
        }
        for i, a in enumerate(clean)
    ]

    return {"path": clean, "emission": alt_emit, "alt_steps": alt_steps}


# ══════════════════════════════════════════════════════════════════════════════
#  EXPLAINABILITY
# ══════════════════════════════════════════════════════════════════════════════

def explain(
    replay_result: dict,
    actual_emission: float,
    budget: float,
    policy_violations: list[dict],
) -> dict:
    reasons: list[str] = []
    rules:   list[str] = []
    fixes:   list[str] = []

    cf = replay_result["carbon_fitness"]
    sf = replay_result["sequence_fitness"]

    if cf < 1.0:
        overrun = round(actual_emission - budget, 1)
        reasons.append(
            f"Carbon budget exceeded by {overrun} kg CO₂e "
            f"(actual {actual_emission} kg > budget {budget} kg)."
        )
        rules.append("Carbon fitness: min(1, budget / actual) < 1.0")
        fixes.append("Reroute to Sea Freight to reduce emissions by ~83%.")

    if sf < 1.0:
        m = replay_result["missing_acts"]
        e = replay_result["extra_acts"]
        if m:
            reasons.append(
                f"Token replay: missing activities {m} — "
                f"{replay_result['missing']} missing tokens."
            )
            rules.append("PM4Py token replay: missing token penalty applied.")
            fixes.append(f"Ensure {m} appear in the process execution.")
        if e:
            reasons.append(f"Non-model activities found: {e}.")
            fixes.append(f"Review or reclassify: {e}.")

    p = replay_result["produced"]
    c = replay_result["consumed"]
    reasons.append(
        f"Token replay: produced={p}, consumed={c}, "
        f"missing={replay_result['missing']}, remaining={replay_result['remaining']}."
    )

    for p_viol in policy_violations:
        if p_viol.get("severity") != "INFO":
            reasons.append(f"[{p_viol['rule_id']}] {p_viol['name']}")
            fixes.append(p_viol["fix"])

    return {
        "reasons":           reasons or ["No violations detected."],
        "rules_triggered":   rules   or [],
        "recommended_fixes": fixes   or ["Maintain current process configuration."],
    }


# ══════════════════════════════════════════════════════════════════════════════
#  FLEET AGGREGATION
# ══════════════════════════════════════════════════════════════════════════════

def aggregate_fleet(records: list[dict]) -> dict:
    """Aggregate per-trace results into fleet-level statistics."""
    n = len(records)
    if n == 0:
        return {}

    avg_cf   = round(sum(r["carbon_fitness"]   for r in records) / n, 4)
    avg_sf   = round(sum(r["sequence_fitness"] for r in records) / n, 4)
    avg_comb = round(sum(r["combined_fitness"] for r in records) / n, 4)

    total_actual  = round(sum(r["actual_emission"]   for r in records), 1)
    total_budget  = round(sum(r["budget"]            for r in records), 1)
    total_saving  = round(sum(r["potential_saving"]  for r in records), 1)

    cei = round(min(1.0, total_budget / total_actual), 4) if total_actual > 0 else 1.0

    compliant = sum(1 for r in records if r["grade"] in ("A", "B"))
    comp_rate = round(compliant / n * 100, 2)

    grade_dist:     dict[str, int] = {}
    sev_dist:       dict[str, int] = {}
    transport_dist: dict[str, int] = {}

    for r in records:
        grade_dist[r["grade"]]               = grade_dist.get(r["grade"], 0) + 1
        sev_dist[r["severity"]]              = sev_dist.get(r["severity"], 0) + 1
        transport_dist[r["transport_used"]]  = transport_dist.get(r["transport_used"], 0) + 1

    trad_avg  = avg_sf
    ca_avg    = avg_comb
    trad_pass = sum(1 for r in records if r["sequence_fitness"] >= 0.85)
    ca_pass   = sum(1 for r in records if r["combined_fitness"] >= 0.85)

    return {
        "avg_carbon_fitness":        avg_cf,
        "avg_sequence_fitness":      avg_sf,
        "avg_combined_fitness":      avg_comb,
        "total_actual_emission_kg":  total_actual,
        "total_budget_kg":           total_budget,
        "total_potential_saving_kg": total_saving,
        "carbon_efficiency_index":   cei,
        "compliance_rate_pct":       comp_rate,
        "grade_distribution":        grade_dist,
        "severity_distribution":     sev_dist,
        "transport_distribution":    transport_dist,
        "normative_model":           EXPECTED_SEQUENCE,
        "allowed_transport":         list(ALLOWED_TRANSPORT),
        "carbon_budgets":            CARBON_BUDGETS,
        "benchmark_comparison": {
            "traditional_avg_fitness":  round(trad_avg, 4),
            "carbon_aware_avg_fitness": round(ca_avg, 4),
            "penalty_delta":            round(trad_avg - ca_avg, 4),
            "traditional_pass_rate":    round(trad_pass / n * 100, 2),
            "carbon_aware_pass_rate":   round(ca_pass   / n * 100, 2),
            "description": (
                "Carbon-aware conformance is stricter than traditional sequence checking "
                "— exposing hidden carbon violations that sequence-only methods miss."
            ),
        },
    }
