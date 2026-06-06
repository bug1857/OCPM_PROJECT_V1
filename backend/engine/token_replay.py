"""
engine/token_replay.py
======================
Real deterministic token replay engine for carbon-aware conformance checking.

Replaces the heuristic LCS approximation with proper token replay against
the normative Petri-net-inspired process model.

Key improvements over previous engine:
  1. Uses ACTUAL trace activities from uploaded event log (not reconstructed)
  2. Token replay is step-by-step, not LCS approximation
  3. Carbon fitness computed per-step with cumulative tracking
  4. Missing/extra tokens tracked precisely
  5. All scores are deterministic given the same input trace

Research contribution:
  dual_fitness = 0.5 * token_replay_fitness + 0.5 * carbon_fitness
  Where token_replay_fitness = (consumed + remaining) / (consumed + remaining + missing + extra)
  And   carbon_fitness       = min(1, budget / actual_emission)
"""

from __future__ import annotations
from typing import Optional

# ── Emission factors (kg CO₂e per unit of carbon intensity) ──────────────────
EMISSION_FACTORS: dict[str, float] = {
    "Create Order":       1.0,
    "Supplier Selection": 2.0,
    "Goods Issue":        5.0,
    "Freight Booking":    8.0,
    "Sea Freight":        50.0,
    "Road Freight":       120.0,
    "Air Freight":        300.0,
    "Warehouse Transfer": 20.0,
    "Customs Clearance":  15.0,
    "Delivery":           10.0,
}

# ── Per-activity carbon budgets (kg CO₂e) ─────────────────────────────────────
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

# Custom budget overrides
_custom_budgets: dict = {}

def apply_custom_budgets(budgets: dict):
    global _custom_budgets
    _custom_budgets = budgets
    CARBON_BUDGETS.update(budgets)

# ── Normative model ───────────────────────────────────────────────────────────
# Represented as an ordered list of places with allowed activities per place.
# Transport is a choice place — any one of the allowed transport activities
# consumes the token.

TRANSPORT_ACTIVITIES: frozenset[str] = frozenset({
    "Sea Freight", "Road Freight", "Air Freight"
})
ALLOWED_TRANSPORT:   frozenset[str] = frozenset({"Sea Freight", "Road Freight"})
FORBIDDEN_TRANSPORT: frozenset[str] = frozenset({"Air Freight"})

# Normative model as ordered places
# Each place is (place_name, allowed_activities_set)
# A "*" means any single activity is allowed (for transport choice)
NORMATIVE_PLACES: list[tuple[str, frozenset]] = [
    ("p0_start",       frozenset({"Create Order"})),
    ("p1_ordered",     frozenset({"Supplier Selection", "Goods Issue"})),  # both allowed
    ("p2_goods",       frozenset({"Goods Issue", "Freight Booking"})),
    ("p3_freight",     TRANSPORT_ACTIVITIES),                               # choice
    ("p4_transport",   frozenset({"Warehouse Transfer", "Customs Clearance"})),
    ("p5_warehouse",   frozenset({"Customs Clearance", "Delivery"})),
    ("p6_customs",     frozenset({"Delivery"})),
]

# Linear expected sequence for alignment (simplified model)
EXPECTED_SEQUENCE: list[str] = [
    "Create Order",
    "Goods Issue",
    "Freight Booking",
    "<transport>",       # placeholder for any transport activity
    "Warehouse Transfer",
    "Customs Clearance",
    "Delivery",
]

OPTIONAL_ACTIVITIES: frozenset[str] = frozenset({
    "Supplier Selection",  # optional but common
    "Freight Booking",     # sometimes merged with transport booking
})

# Order-type budget tiers
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

    Algorithm (inspired by PM4Py token-based replay):
    1. Place a token on the initial place (p0_start)
    2. For each activity in the trace:
       a. If it fits the current place → consume token, move forward
       b. If it's an optional activity → allow without consuming model token
       c. If it doesn't fit → mark as EXTRA, add missing token cost
    3. After trace ends → count remaining expected places as MISSING
    4. Fitness = (produced + consumed) / (produced + consumed + missing + remaining)

    Returns full replay result with per-step annotation.
    """
    # Build the linear model resolving transport placeholder
    transport_in_trace = next(
        (a for a in activities if a in TRANSPORT_ACTIVITIES), None
    )
    model = [
        (transport_in_trace or "Sea Freight") if a == "<transport>" else a
        for a in EXPECTED_SEQUENCE
    ]

    # Token replay state
    produced  = 1   # initial token
    consumed  = 0
    missing   = 0
    remaining = 0

    model_ptr   = 0           # current position in normative model
    steps       = []
    cumulative  = 0.0
    missing_acts: list[str] = []
    extra_acts:   list[str] = []

    # Track which model activities were consumed
    consumed_model: list[str] = []

    for act in activities:
        ef       = EMISSION_FACTORS.get(act, 5.0)
        emit     = round(ef * carbon_intensity, 2)
        budget_a = CARBON_BUDGETS.get(act, 50.0)
        cf_step  = round(min(1.0, budget_a / emit) if emit > 0 else 1.0, 4)
        cumulative += emit
        is_forbidden  = act in FORBIDDEN_TRANSPORT
        in_model      = act in set(model)

        if model_ptr < len(model) and act == model[model_ptr]:
            # ✅ Perfect match — consume token
            consumed     += 1
            produced     += 1
            consumed_model.append(act)
            step_status   = "MATCH"
            model_ptr    += 1

        elif act in OPTIONAL_ACTIVITIES and act not in model:
            # ✅ Optional activity — allow, don't advance model
            step_status = "OPTIONAL"

        elif model_ptr < len(model) and act in TRANSPORT_ACTIVITIES and model[model_ptr] in TRANSPORT_ACTIVITIES:
            # ✅ Transport choice — any transport satisfies the transport place
            consumed     += 1
            produced     += 1
            consumed_model.append(act)
            step_status   = "MATCH" if act in ALLOWED_TRANSPORT else "VIOLATION"
            model_ptr    += 1

        elif in_model:
            # ⚠️ Activity is in model but out of order
            # Advance model pointer to find it (add missing tokens for skipped)
            found = False
            temp_ptr = model_ptr
            while temp_ptr < len(model):
                if model[temp_ptr] == act or (
                    act in TRANSPORT_ACTIVITIES and model[temp_ptr] in TRANSPORT_ACTIVITIES
                ):
                    # Count skipped as missing
                    for skipped in model[model_ptr:temp_ptr]:
                        if skipped not in OPTIONAL_ACTIVITIES:
                            missing += 1
                            missing_acts.append(skipped)
                    consumed  += 1
                    produced  += 1
                    model_ptr  = temp_ptr + 1
                    step_status = "OUT_OF_ORDER"
                    found = True
                    break
                temp_ptr += 1
            if not found:
                step_status = "EXTRA"
                extra_acts.append(act)
                missing += 1

        else:
            # ❌ Activity not in model at all
            step_status = "EXTRA"
            extra_acts.append(act)

        steps.append({
            "step":                len(steps) + 1,
            "activity":            act,
            "status":              step_status,
            "emission_kg":         emit,
            "budget_kg":           budget_a,
            "carbon_fitness":      cf_step,
            "in_normative_model":  in_model or act in OPTIONAL_ACTIVITIES,
            "is_violation":        is_forbidden or (step_status == "VIOLATION"),
            "is_duplicate":        activities.count(act) > 1,
            "cumulative_emission": round(cumulative, 2),
            "overrun_kg":          round(max(0.0, emit - budget_a), 2),
        })

    # Count remaining model places not consumed
    for remaining_act in model[model_ptr:]:
        if remaining_act not in OPTIONAL_ACTIVITIES:
            remaining += 1
            if remaining_act not in missing_acts:
                missing_acts.append(remaining_act)

    # ── Token replay fitness formula ──────────────────────────────────────────
    # Standard PM4Py formula:
    # fitness = 0.5 * (1 - missing/produced) + 0.5 * (1 - remaining/consumed)
    p = produced if produced > 0 else 1
    c = consumed if consumed > 0 else 1
    seq_fitness = round(
        0.5 * (1 - missing / p) + 0.5 * (1 - remaining / c),
        4
    )
    seq_fitness = max(0.0, min(1.0, seq_fitness))

    # ── Carbon fitness ────────────────────────────────────────────────────────
    actual_emission  = round(cumulative, 2)
    carbon_fitness   = round(min(1.0, order_budget / actual_emission) if actual_emission > 0 else 1.0, 4)

    # ── Combined dual-objective fitness ───────────────────────────────────────
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
        "missing_acts":     list(dict.fromkeys(missing_acts)),  # deduplicated
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
#  GREEN REROUTING
# ══════════════════════════════════════════════════════════════════════════════

def green_reroute(
    activities: list[str],
    carbon_intensity: float,
    order_type: str = "standard",
) -> dict:
    """
    Replace forbidden/high-emission transport with optimal green alternative.
    Returns alternative path + emissions.
    """
    best = "Road Freight" if order_type == "urgent" else "Sea Freight"

    alt = [
        best if a in TRANSPORT_ACTIVITIES else a
        for a in activities
    ]

    # Deduplicate consecutive same activities
    clean: list[str] = []
    for a in alt:
        if not clean or clean[-1] != a:
            clean.append(a)

    alt_emit = round(
        sum(EMISSION_FACTORS.get(a, 5.0) * carbon_intensity for a in clean), 2
    )

    # Build alt steps
    alt_steps = []
    for i, a in enumerate(clean):
        ef   = EMISSION_FACTORS.get(a, 5.0)
        emit = round(ef * carbon_intensity, 2)
        alt_steps.append({
            "step":        i + 1,
            "activity":    a,
            "emission_kg": emit,
        })

    return {
        "path":       clean,
        "emission":   alt_emit,
        "alt_steps":  alt_steps,
    }


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
            reasons.append(f"Token replay: missing activities {m} — {replay_result['missing']} missing tokens.")
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

    grade_dist: dict[str, int] = {}
    sev_dist:   dict[str, int] = {}
    transport_dist: dict[str, int] = {}

    for r in records:
        grade_dist[r["grade"]]            = grade_dist.get(r["grade"], 0) + 1
        sev_dist[r["severity"]]           = sev_dist.get(r["severity"], 0) + 1
        transport_dist[r["transport_used"]] = transport_dist.get(r["transport_used"], 0) + 1

    # Benchmark: traditional (seq only) vs carbon-aware (combined)
    trad_avg = avg_sf
    ca_avg   = avg_comb
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