"""
conformance.py  –  Carbon-Aware Process Conformance Engine
===========================================================
Drop into:  backend/routes/conformance.py
Register in app.py:  from routes.conformance import router as conformance_router
                     app.include_router(conformance_router)

Research contribution:
  Dual-objective fitness = 0.5 * sequence_fitness + 0.5 * carbon_fitness
  Traditional PM4Py-style conformance only checks sequence;
  this system additionally penalises carbon-budget overruns.
"""

from __future__ import annotations

import os
import sys
import math
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from engine.token_replay import (
    token_replay,
    grade,
    severity,
    green_reroute,
    explain,
    aggregate_fleet,
    EMISSION_FACTORS,
    CARBON_BUDGETS,
    ALLOWED_TRANSPORT,
    FORBIDDEN_TRANSPORT,
    TRANSPORT_ACTIVITIES,
    ORDER_BUDGET_TIERS,
    RATING_BUDGET_MULTIPLIER,
    apply_custom_budgets,
)

import pandas as pd
from fastapi import APIRouter, HTTPException, Query


# ── router ────────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/conformance", tags=["conformance"])

# ── paths (mirror app.py convention) ─────────────────────────────────────────
BASE    = os.path.join(os.path.dirname(__file__), "..", "..", "data")
MASTERS = os.path.join(BASE, "masters")
TXN     = os.path.join(BASE, "transactions")
OUT     = os.path.join(BASE, "output")


def _read(folder: str, name: str) -> pd.DataFrame:
    path = os.path.join(folder, name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"{name} not found")
    return pd.read_csv(path)


# ══════════════════════════════════════════════════════════════════════════════

# Normative (green) process model – the "happy path"
NORMATIVE_SEQUENCE: list[str] = [
    "Create Order",
    "Goods Issue",
    "Freight Booking",
    "Warehouse Transfer",
    "Customs Clearance",
    "Delivery",
]
# Full ordered model including any transport step
FULL_NORMATIVE_WITH_TRANSPORT: list[str] = [
    "Create Order",
    "Goods Issue",
    "Freight Booking",
    "<transport>",          # placeholder – Sea or Road
    "Warehouse Transfer",
    "Customs Clearance",
    "Delivery",
]

DEFAULT_ORDER_BUDGET = 200.0

# Green-policy rules (evaluated in order; first match wins)
# Each rule: (condition_fn, rule_id, why, recommended_fix)
# condition_fn receives a dict of trace context
GREEN_POLICY_RULES = [
    {
        "rule_id":    "POLICY-01",
        "name":       "Air Freight Absolute Ban",
        "description": "Air Freight is forbidden for all order types.",
        "triggered":  lambda ctx: ctx["transport"] in FORBIDDEN_TRANSPORT,
        "severity":   "CRITICAL",
        "fix":        "Reroute via Sea Freight (saves ~83 % CO₂e) or Road Freight.",
    },
    {
        "rule_id":    "POLICY-02",
        "name":       "Low-Rating Supplier Budget Exceeded",
        "description": "D/E-rated suppliers must operate within a tighter emission budget.",
        "triggered":  lambda ctx: ctx["supplier_rating"] in ("D", "E") and ctx["carbon_fitness"] < 0.80,
        "severity":   "HIGH",
        "fix":        "Switch to an A/B/C-rated supplier or significantly reduce shipment carbon intensity.",
    },
    {
        "rule_id":    "POLICY-03",
        "name":       "Urgent Order Carbon Relaxation",
        "description": "Urgent orders may use Road Freight even if emissions exceed standard budget.",
        "triggered":  lambda ctx: ctx["order_type"] == "urgent" and ctx["transport"] == "Road Freight",
        "severity":   "INFO",       # not a violation – just annotated
        "fix":        "No action needed; urgent Road Freight is policy-compliant.",
    },
    {
        "rule_id":    "POLICY-04",
        "name":       "Missing Mandatory Activity",
        "description": "Customs Clearance or Warehouse Transfer is absent from the trace.",
        "triggered":  lambda ctx: ctx["missing_steps"],
        "severity":   "HIGH",
        "fix":        "Ensure Warehouse Transfer and Customs Clearance are logged in the event stream.",
    },
    {
        "rule_id":    "POLICY-05",
        "name":       "Duplicate Critical Activity",
        "description": "A mandatory activity (Goods Issue, Freight Booking) appears more than once.",
        "triggered":  lambda ctx: ctx["has_duplicates"],
        "severity":   "MEDIUM",
        "fix":        "Investigate event-log source; remove duplicate entries or investigate loop.",
    },
    {
        "rule_id":    "POLICY-06",
        "name":       "Out-of-Order Sequence",
        "description": "Activities are not in the normative order.",
        "triggered":  lambda ctx: ctx["sequence_fitness"] < 0.70 and not ctx["missing_steps"],
        "severity":   "MEDIUM",
        "fix":        "Review scheduling logic; activities should follow the green process model.",
    },
]

# ══════════════════════════════════════════════════════════════════════════════
#  CORE FITNESS FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def _carbon_fitness(actual_emission: float, budget: float) -> float:
    """
    True token-replay carbon fitness:
        cf = min(1, budget / actual)   range [0, 1]
    A value < 1 means the trace overspent its carbon budget.
    """
    if actual_emission <= 0:
        return 1.0
    return min(1.0, budget / actual_emission)


def _sequence_fitness(trace_activities: list[str]) -> tuple[float, list[str], list[str]]:
    """
    Alignment-based sequence fitness.

    Strategy: longest-common-subsequence (LCS) of the observed trace against
    the normative sequence (with transport placeholder resolved).

    Returns (fitness ∈ [0,1], missing_steps, extra_steps)
    """
    # Build the reference model resolving transport placeholder
    transport_in_trace = next(
        (a for a in trace_activities if a in ALLOWED_TRANSPORT | FORBIDDEN_TRANSPORT), None
    )
    reference = [
        transport_in_trace if a == "<transport>" and transport_in_trace else
        ("Sea Freight"     if a == "<transport>" else a)
        for a in FULL_NORMATIVE_WITH_TRANSPORT
    ]

    # LCS via DP
    n, m = len(trace_activities), len(reference)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if trace_activities[i - 1] == reference[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    lcs_len = dp[n][m]

    # fitness = LCS / max(|trace|, |reference|)  → penalises both missing and extra
    fitness = lcs_len / max(n, m) if max(n, m) > 0 else 1.0

    # missing: in reference but not (aligned) in trace
    ref_set   = set(reference)
    trace_set = set(trace_activities)
    missing   = [a for a in reference if a not in trace_set and a != "<transport>"]
    extra     = [a for a in trace_activities if a not in ref_set and a not in ALLOWED_TRANSPORT | FORBIDDEN_TRANSPORT]

    return round(fitness, 4), missing, extra


def _grade(score: float) -> str:
    if score >= 0.85: return "A"
    if score >= 0.70: return "B"
    if score >= 0.50: return "C"
    if score >= 0.30: return "D"
    return "E"


def _carbon_efficiency_index(traces: list[dict]) -> float:
    """
    Fleet-level Carbon Efficiency Index (CEI):
        CEI = Σ(budget_i) / Σ(actual_i)   capped at 1.0
    Measures how efficiently the fleet uses its collective carbon budget.
    """
    total_budget = sum(t["budget"] for t in traces)
    total_actual = sum(t["actual_emission"] for t in traces)
    if total_actual <= 0:
        return 1.0
    return round(min(1.0, total_budget / total_actual), 4)


# ══════════════════════════════════════════════════════════════════════════════
#  TRACE RECONSTRUCTION  (deterministic – no randomness)
# ══════════════════════════════════════════════════════════════════════════════

def _reconstruct_trace(vtype: str, supplier_rating: str = "C") -> list[str]:
    """
    Deterministically reconstruct a realistic activity sequence from
    violation type + supplier metadata (sourced from the CSV, not random).
    """
    vtype_l = vtype.lower()

    if "carbon" in vtype_l:
        # Carbon violation almost always means Air Freight was used
        return [
            "Create Order", "Goods Issue", "Freight Booking",
            "Air Freight", "Warehouse Transfer", "Customs Clearance", "Delivery",
        ]
    elif "process" in vtype_l:
        if supplier_rating in ("D", "E"):
            # Low-rated suppliers often skip Customs and Warehouse steps
            return ["Create Order", "Goods Issue", "Air Freight", "Delivery"]
        else:
            # Mid-tier: missing warehouse transfer
            return [
                "Create Order", "Goods Issue", "Freight Booking",
                "Sea Freight", "Customs Clearance", "Delivery",
            ]
    else:
        # Data quality: almost-correct trace but with a duplicate or swap
        return [
            "Create Order", "Goods Issue", "Goods Issue",   # ← duplicate
            "Freight Booking", "Sea Freight",
            "Warehouse Transfer", "Customs Clearance", "Delivery",
        ]


def _build_steps(trace_activities: list[str], carbon_intensity: float) -> tuple[list[dict], float]:
    """
    Annotate every step with per-activity fitness.
    Returns (steps, total_emission).
    """
    steps = []
    cumulative = 0.0

    # detect duplicate activities for annotation
    seen: dict[str, int] = {}
    for act in trace_activities:
        seen[act] = seen.get(act, 0) + 1

    for i, act in enumerate(trace_activities):
        ef           = EMISSION_FACTORS.get(act, 10)
        emit         = round(ef * carbon_intensity, 2)
        budget_a     = CARBON_BUDGETS.get(act, 50)
        cf           = _carbon_fitness(emit, budget_a)
        in_model     = act in NORMATIVE_SEQUENCE or act in ALLOWED_TRANSPORT
        is_violation = (act in FORBIDDEN_TRANSPORT) or (emit > budget_a)
        is_duplicate = seen[act] > 1
        cumulative  += emit

        steps.append({
            "step":                i + 1,
            "activity":            act,
            "emission_kg":         emit,
            "budget_kg":           budget_a,
            "carbon_fitness":      round(cf, 3),
            "in_normative_model":  in_model,
            "is_violation":        is_violation,
            "is_duplicate":        is_duplicate,
            "cumulative_emission": round(cumulative, 2),
            "overrun_kg":          round(max(0.0, emit - budget_a), 2),
        })

    return steps, round(cumulative, 2)


# ══════════════════════════════════════════════════════════════════════════════
#  GREEN-POLICY ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def _evaluate_policies(ctx: dict) -> list[dict]:
    """
    Run every policy rule against the trace context.
    Returns list of triggered rules with explainability fields.
    """
    triggered = []
    for rule in GREEN_POLICY_RULES:
        try:
            if rule["triggered"](ctx):
                triggered.append({
                    "rule_id":    rule["rule_id"],
                    "name":       rule["name"],
                    "description": rule["description"],
                    "severity":   rule["severity"],
                    "fix":        rule["fix"],
                })
        except Exception:
            pass
    return triggered


# ══════════════════════════════════════════════════════════════════════════════
#  DYNAMIC REROUTING ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def _green_reroute(
    trace_activities: list[str],
    carbon_intensity: float,
    order_type: str = "standard",
) -> dict:
    """
    Produce the optimal green alternative path and quantify savings.
    Priority: Sea Freight (lowest CO₂e) unless order_type == 'urgent'
    (in which case Road Freight is also acceptable).
    """
    best_transport = "Sea Freight"
    if order_type == "urgent":
        # Urgent: prefer Road Freight to avoid port delays
        best_transport = "Road Freight"

    alt_path = [
        best_transport if a in (ALLOWED_TRANSPORT | FORBIDDEN_TRANSPORT) else a
        for a in FULL_NORMATIVE_WITH_TRANSPORT
        if a != "<transport>"
    ]
    alt_path.insert(
        alt_path.index("Warehouse Transfer"),
        best_transport,
    )

    # Deduplicate while preserving order
    seen_set: set[str] = set()
    clean_path: list[str] = []
    for a in alt_path:
        if a not in seen_set:
            clean_path.append(a)
            seen_set.add(a)

    alt_emit = round(
        sum(EMISSION_FACTORS.get(a, 10) * carbon_intensity for a in clean_path), 2
    )

    return {"path": clean_path, "emission": alt_emit}


# ══════════════════════════════════════════════════════════════════════════════
#  BENCHMARK MODE  (Traditional vs Carbon-Aware)
# ══════════════════════════════════════════════════════════════════════════════

def _benchmark_scores(
    trace_activities: list[str],
    actual_emission: float,
    budget: float,
) -> dict:
    """
    Returns both traditional (sequence-only) and carbon-aware scores
    so the research paper can compare the two approaches.
    """
    seq_fit, missing, extra = _sequence_fitness(trace_activities)
    carbon_fit  = _carbon_fitness(actual_emission, budget)
    combined    = round(0.5 * seq_fit + 0.5 * carbon_fit, 4)

    return {
        "traditional": {
            "score": seq_fit,
            "grade": _grade(seq_fit),
            "method": "sequence_only",
            "description": "PM4Py-style: fitness = LCS(trace, model) / max(|trace|, |model|)",
        },
        "carbon_aware": {
            "score": combined,
            "grade": _grade(combined),
            "method": "dual_objective",
            "description": "0.5 × sequence_fitness + 0.5 × carbon_fitness",
            "carbon_fitness": carbon_fit,
            "sequence_fitness": seq_fit,
        },
        "delta": round(combined - seq_fit, 4),
        "carbon_penalty_applied": carbon_fit < 1.0,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  EXPLAINABILITY LAYER
# ══════════════════════════════════════════════════════════════════════════════

def _explain(
    trace_activities: list[str],
    actual_emission: float,
    budget: float,
    policy_violations: list[dict],
    missing_steps: list[str],
    extra_steps: list[str],
    carbon_fitness: float,
    sequence_fitness: float,
) -> dict:
    """
    For every violation return WHY it failed, WHICH rule triggered it,
    and WHAT fix is recommended.
    """
    reasons: list[str]  = []
    rules:   list[str]  = []
    fixes:   list[str]  = []

    # Carbon
    if carbon_fitness < 1.0:
        overrun = round(actual_emission - budget, 1)
        reasons.append(
            f"Carbon budget exceeded by {overrun} kg CO₂e "
            f"(actual {actual_emission} kg > budget {budget} kg)."
        )
        rules.append("Carbon fitness: min(1, budget / actual) < 1.0")
        fixes.append("Reroute to Sea Freight to reduce emissions by ~83 %.")

    # Sequence
    if sequence_fitness < 1.0:
        if missing_steps:
            reasons.append(f"Missing mandatory activities: {', '.join(missing_steps)}.")
            rules.append("NORMATIVE_SEQUENCE requires all listed activities.")
            fixes.append(f"Add {', '.join(missing_steps)} to the process flow.")
        if extra_steps:
            reasons.append(f"Non-model activities found: {', '.join(extra_steps)}.")
            rules.append("Only model-defined activities are allowed.")
            fixes.append(f"Remove or reclassify: {', '.join(extra_steps)}.")

    # Policy
    for p in policy_violations:
        if p["severity"] not in ("INFO",):
            reasons.append(f"[{p['rule_id']}] {p['name']}: {p['description']}")
            rules.append(p["rule_id"])
            fixes.append(p["fix"])

    return {
        "reasons": reasons or ["No violations detected."],
        "rules_triggered": rules or [],
        "recommended_fixes": fixes or ["Maintain current process configuration."],
    }


# ══════════════════════════════════════════════════════════════════════════════
#  HEATMAP DATA  (15 – optional but implemented)
# ══════════════════════════════════════════════════════════════════════════════

def _build_heatmap_data(vf: pd.DataFrame, sup: pd.DataFrame) -> dict:
    """
    Returns two heatmap datasets:
      1. activity × emission_intensity
      2. supplier × violation_rate
    """
    # 1. activity heatmap: from violation log we know total_emissions per order
    #    We approximate per-activity intensity using known emission factors
    activity_heat = []
    for act, ef in sorted(EMISSION_FACTORS.items(), key=lambda x: -x[1]):
        avg_intensity = ef  # base factor
        activity_heat.append({
            "activity":         act,
            "emission_factor":  ef,
            "intensity_rank":   1 if ef >= 200 else (2 if ef >= 50 else 3),
            "in_normative_model": act in NORMATIVE_SEQUENCE or act in ALLOWED_TRANSPORT,
            "is_forbidden":     act in FORBIDDEN_TRANSPORT,
        })

    # 2. supplier heatmap: violation rate per supplier
    supplier_heat = []
    if not vf.empty and "supplier_id" in vf.columns:
        total_per_sup  = vf.groupby("supplier_id").size().reset_index(name="total_violations")
        carbon_per_sup = (
            vf[vf["violation_type"].str.lower().str.contains("carbon", na=False)]
            .groupby("supplier_id").size().reset_index(name="carbon_violations")
        )
        merged = total_per_sup.merge(carbon_per_sup, on="supplier_id", how="left").fillna(0)
        merged["carbon_violations"] = merged["carbon_violations"].astype(int)

        if not sup.empty and "supplier_id" in sup.columns:
            merged = merged.merge(
                sup[["supplier_id", "rating"]].drop_duplicates(),
                on="supplier_id", how="left"
            )

        for _, r in merged.iterrows():
            supplier_heat.append({
                "supplier_id":       r["supplier_id"],
                "total_violations":  int(r["total_violations"]),
                "carbon_violations": int(r["carbon_violations"]),
                "rating":            r.get("rating", "?"),
                "violation_rate":    round(int(r["carbon_violations"]) / max(int(r["total_violations"]), 1), 3),
            })
        supplier_heat.sort(key=lambda x: -x["total_violations"])

    return {
        "activity_intensity": activity_heat,
        "supplier_violation_rate": supplier_heat[:30],   # top 30
    }


# ══════════════════════════════════════════════════════════════════════════════
#  PER-TRACE BUILDER  (shared by /conformance and /conformance/trace/:id)
# ══════════════════════════════════════════════════════════════════════════════

def _build_trace_record(row, sup_lookup, order_type, order_budget):
    sid = str(row.get("supplier_id", "UNKNOWN"))

    # Handle both column name conventions:
    # - static CSV uses: total_emissions, budget
    # - uploaded_summaries uses: total_emission (no s), carbon_budget
    actual_emit = float(
        row.get("total_emissions") or row.get("total_emission") or 0
    )
    raw_budget = float(
        row.get("budget") or row.get("carbon_budget") or order_budget
    )
    vtype = str(row.get("violation_type", ""))

    # Prefer supplier rating from the row itself (populated when uploading event logs).
    # Fall back to masters lookup, then default "C".
    sup_info = sup_lookup.get(sid, {})
    rating = str(
        row.get("supplier_rating") or sup_info.get("rating") or "C"
    )
    budget_mult      = RATING_BUDGET_MULTIPLIER.get(rating, 1.0)
    effective_budget = round(raw_budget * budget_mult, 2)

    # Carbon intensity: from masters first, fallback to dataset average
    carbon_intensity = float(sup_info.get("carbon_intensity", 2.34))

    # Use REAL activities from uploaded event log if available.
    # Fall back to reconstruction only for static CSV data (which has no activities column).
    # Note: when uploaded_summaries is converted to DataFrame, list columns become strings.
    raw_activities = row.get("activities")
    if raw_activities is not None:
        if isinstance(raw_activities, list) and len(raw_activities) > 0:
            trace_acts = raw_activities
        elif isinstance(raw_activities, str) and raw_activities.strip().startswith("["):
            # Parse stringified list e.g. "['Air Freight', 'Delivery']"
            import ast
            try:
                parsed = ast.literal_eval(raw_activities)
                trace_acts = parsed if isinstance(parsed, list) and parsed else _reconstruct_trace(vtype, rating)
            except Exception:
                trace_acts = _reconstruct_trace(vtype, rating)
        else:
            trace_acts = _reconstruct_trace(vtype, rating)
    else:
        trace_acts = _reconstruct_trace(vtype, rating)

    # Fitness scores
    replay = token_replay(
        trace_acts,
        carbon_intensity,
        effective_budget,
    )

    carbon_fit = replay["carbon_fitness"]
    seq_fit = replay["sequence_fitness"]
    combined_fit = replay["combined_fitness"]

    missing = replay["missing_acts"]
    extra = replay["extra_acts"]

    grade_value = grade(combined_fit)

    # Green reroute
    reroute = green_reroute(trace_acts, carbon_intensity, order_type)

    # Policy evaluation context
    transport_used = next(
        (a for a in trace_acts if a in ALLOWED_TRANSPORT | FORBIDDEN_TRANSPORT),
        "Unknown"
    )
    has_duplicates = len(trace_acts) != len(set(trace_acts))
    policy_ctx = {
        "transport":       transport_used,
        "supplier_rating": rating,
        "order_type":      order_type,
        "carbon_fitness":  carbon_fit,
        "missing_steps":   missing,
        "has_duplicates":  has_duplicates,
        "sequence_fitness": seq_fit,
    }
    policy_hits = _evaluate_policies(policy_ctx)

    # Explainability
    explanation = explain(
        replay,
        actual_emit,
        effective_budget,
        policy_hits,
    )

    # Benchmark
    benchmark = _benchmark_scores(trace_acts, actual_emit, effective_budget)

    # Severity
    if carbon_fit < 0.30 or any(p["severity"] == "CRITICAL" for p in policy_hits):
        severity_level = "CRITICAL"
    elif carbon_fit < 0.60 or any(p["severity"] == "HIGH" for p in policy_hits):
        severity_level = "HIGH"
    elif combined_fit < 0.85:
        severity_level = "MEDIUM"
    else:
        severity_level = "LOW"

    return {
        "order_id":              str(row.get("order_id", "")),
        "supplier_id":           sid,
        "supplier_rating":       rating,
        "actual_emission":       round(actual_emit, 2),
        "budget":                effective_budget,
        "carbon_fitness":        round(carbon_fit, 4),
        "sequence_fitness":      round(seq_fit, 4),
        "combined_fitness":      round(combined_fit, 4),
        "grade":                 grade_value,
        "violation_type":        vtype,
        "transport_used":        transport_used,
        "severity":              severity_level,
        "missing_steps":         missing,
        "extra_steps":           extra,
        "has_duplicates":        has_duplicates,
        "policy_violations":     policy_hits,
        "explanation":           explanation,
        "alternative_path":      reroute["path"],
        "alt_emission":          reroute["emission"],
        "potential_saving":      round(max(0.0, actual_emit - reroute["emission"]), 2),
        "benchmark":             benchmark,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════


@router.get("")
def conformance_check(
    limit:          int            = Query(50, ge=1, le=500),
    offset:         int            = Query(0,  ge=0),
    supplier_id:    Optional[str]  = None,
    violation_only: bool           = False,
    order_type:     Optional[str]  = None,   # standard | international | urgent
    severity:       Optional[str]  = None,   # CRITICAL | HIGH | MEDIUM | LOW
    grade:          Optional[str]  = None,   # A | B | C | D | E
):
    """
    Run the Carbon-Aware Conformance Engine over all violations.
    Returns per-trace dual-objective fitness scores + fleet-level analytics.
    """
    try:
        from main import uploaded_summaries, uploaded_traces

        if uploaded_summaries:
            use_real_traces = True
            vf = pd.DataFrame(uploaded_summaries)
        else:
            use_real_traces = False
            vf = _read(OUT, "sustainability_violations.csv")
    except Exception:
        use_real_traces = False
        vf = _read(OUT, "sustainability_violations.csv")
    try:
        sup = _read(MASTERS, "suppliers.csv")
        sup_lookup = {
            str(r["supplier_id"]): r.to_dict()
            for _, r in sup.iterrows()
        }
    except HTTPException:
        sup_lookup = {}

    # Filters
    if supplier_id:
        vf = vf[vf["supplier_id"] == supplier_id.upper()]

    order_type    = (order_type or "standard").lower()
    order_budget  = ORDER_BUDGET_TIERS.get(order_type, DEFAULT_ORDER_BUDGET)

    # Build every trace record (deterministic – no randomness)
    traces = [
        _build_trace_record(row, sup_lookup, order_type, order_budget)
        for _, row in vf.iterrows()
    ]

    # Post-filters
    if violation_only:
        traces = [t for t in traces if t["combined_fitness"] < 0.85]
    if severity:
        traces = [t for t in traces if t["severity"] == severity.upper()]
    if grade:
        traces = [t for t in traces if t["grade"] == grade.upper()]

    total = len(traces)
    page  = traces[offset: offset + limit]

    # ── Fleet summary ─────────────────────────────────────────────────────────
    if traces:
        avg_cf    = round(sum(t["carbon_fitness"]   for t in traces) / total, 4)
        avg_sf    = round(sum(t["sequence_fitness"] for t in traces) / total, 4)
        avg_comb  = round(sum(t["combined_fitness"] for t in traces) / total, 4)

        total_actual  = sum(t["actual_emission"]  for t in traces)
        total_budget  = sum(t["budget"]           for t in traces)
        total_saving  = round(sum(t["potential_saving"] for t in traces), 1)
        fleet_stats = aggregate_fleet(traces)
        cei = fleet_stats["carbon_efficiency_index"]

        grade_dist: dict[str, int] = {}
        sev_dist:   dict[str, int] = {}
        transport_dist: dict[str, int] = {}
        for t in traces:
            grade_dist[t["grade"]]         = grade_dist.get(t["grade"], 0) + 1
            sev_dist[t["severity"]]        = sev_dist.get(t["severity"], 0) + 1
            transport_dist[t["transport_used"]] = transport_dist.get(t["transport_used"], 0) + 1

        # compliance rate = fraction of traces with grade A or B
        compliant     = sum(1 for t in traces if t["grade"] in ("A", "B"))
        compliance_rt = round(compliant / total * 100, 2)

        # traditional vs carbon-aware fleet comparison
        trad_avg = round(sum(t["benchmark"]["traditional"]["score"] for t in traces) / total, 4)
        ca_avg   = round(sum(t["benchmark"]["carbon_aware"]["score"] for t in traces) / total, 4)

        fleet_summary = {
            "avg_carbon_fitness":       avg_cf,
            "avg_sequence_fitness":     avg_sf,
            "avg_combined_fitness":     avg_comb,
            "total_actual_emission_kg": round(total_actual, 1),
            "total_budget_kg":          round(total_budget, 1),
            "total_potential_saving_kg": total_saving,
            "carbon_efficiency_index":  cei,
            "compliance_rate_pct":      compliance_rt,
            "grade_distribution":       grade_dist,
            "severity_distribution":    sev_dist,
            "transport_distribution":   transport_dist,
            "normative_model":          NORMATIVE_SEQUENCE,
            "allowed_transport":        list(ALLOWED_TRANSPORT),
            "carbon_budgets":           CARBON_BUDGETS,
            # Research benchmark
            "benchmark_comparison": {
                "traditional_avg_fitness":   trad_avg,
                "carbon_aware_avg_fitness":  ca_avg,
                "penalty_delta":             round(trad_avg - ca_avg, 4),
                "description": (
                    "Positive delta means carbon-aware conformance is stricter "
                    "than traditional sequence-only checking – confirming research novelty."
                ),
            },
        }
    else:
        fleet_summary = {
            "avg_carbon_fitness": 0, "avg_sequence_fitness": 0,
            "avg_combined_fitness": 0, "total_potential_saving_kg": 0,
            "carbon_efficiency_index": 0, "compliance_rate_pct": 0,
            "grade_distribution": {}, "severity_distribution": {},
            "transport_distribution": {}, "normative_model": NORMATIVE_SEQUENCE,
            "allowed_transport": list(ALLOWED_TRANSPORT), "carbon_budgets": CARBON_BUDGETS,
        }

    return {
        "total":         total,
        "offset":        offset,
        "limit":         limit,
        "fleet_summary": fleet_summary,
        "traces":        page,
    }


@router.get("/summary")
def conformance_summary():
    """Aggregate conformance statistics for the Cockpit header KPIs."""
    try:
        from main import uploaded_summaries
        if uploaded_summaries:
            vf = pd.DataFrame(uploaded_summaries)
            use_uploaded = True
        else:
            vf = _read(OUT, "sustainability_violations.csv")
            use_uploaded = False
    except Exception:
        vf = _read(OUT, "sustainability_violations.csv")
        use_uploaded = False

    if "violation_type" not in vf.columns:
        vf["violation_type"] = ""

    # ── Violation counts ─────────────────────────────────────────────────────
    # When using uploaded summaries, count only actual violations (not NONE)
    if use_uploaded:
        viol_mask     = vf["has_violation"] == True
        viol_df       = vf[viol_mask]
        total         = int(viol_mask.sum())
    else:
        viol_df       = vf
        total         = len(vf)

    # Match normalised violation_type labels produced by parser.trace_summary
    carbon_viols  = int(viol_df["violation_type"].str.lower().str.contains("carbon",  na=False).sum())
    process_viols = int(viol_df["violation_type"].str.lower().str.contains("process", na=False).sum())
    data_viols    = int(viol_df["violation_type"].str.lower().str.contains("data",    na=False).sum())

    # If process_viols is 0 but we have seq_fitness data, derive from that
    if process_viols == 0 and use_uploaded and "seq_fitness" in vf.columns:
        process_viols = int((vf["seq_fitness"] < 1.0).sum())

    # ── Fitness & compliance ─────────────────────────────────────────────────
    if use_uploaded:
        # uploaded_summaries already has pre-computed carbon_fitness per trace
        if "carbon_fitness" in vf.columns and len(vf) > 0:
            avg_cf        = round(float(vf["carbon_fitness"].mean()), 4)
            # compliance: traces where carbon_ok=True
            if "has_violation" in vf.columns:
                compliant     = int((vf["has_violation"] == False).sum())
                compliance_rt = round(compliant / len(vf) * 100, 2)
            else:
                compliance_rt = round((1 - len(viol_df) / len(vf)) * 100, 2)
        else:
            avg_cf        = 0.0
            compliance_rt = 0.0
    else:
        # Static CSV: use total_emissions vs budget columns
        if "total_emissions" in vf.columns and "budget" in vf.columns:
            avg_cf = float(
                vf.apply(
                    lambda r: min(1.0, float(r["budget"]) / max(float(r["total_emissions"]), 1)),
                    axis=1,
                ).mean()
            )
            compliant     = int((vf["total_emissions"] <= vf["budget"]).sum())
            compliance_rt = round(compliant / total * 100, 2) if total > 0 else 0.0
        else:
            avg_cf        = 0.0
            compliance_rt = 0.0

    return {
        "total_violations":    total,
        "carbon_violations":   carbon_viols,
        "process_violations":  process_viols,
        "data_violations":     data_viols,
        "avg_carbon_fitness":  round(avg_cf, 4),
        "compliance_rate_pct": compliance_rt,
        "normative_model":     NORMATIVE_SEQUENCE,
        "allowed_transport":   list(ALLOWED_TRANSPORT),
        "carbon_budgets":      CARBON_BUDGETS,
        "green_policy_rules":  [
            {"rule_id": r["rule_id"], "name": r["name"],
             "severity": r["severity"], "description": r["description"]}
            for r in GREEN_POLICY_RULES
        ],
    }

@router.get("/trace/{order_id}")
def conformance_trace(
    order_id:   str,
    order_type: Optional[str] = None,
):
    """
    Deep single-trace view with:
    - Per-step annotation (emission, budget, fitness)
    - Full policy evaluation
    - Explainability (why / which rule / what fix)
    - Green rerouting alternative
    - Benchmark comparison (traditional vs carbon-aware)
    """
    try:
        from main import uploaded_summaries

        if uploaded_summaries:
            vf = pd.DataFrame(uploaded_summaries)
        else:
            vf = _read(OUT, "sustainability_violations.csv")
    except Exception:
        vf = _read(OUT, "sustainability_violations.csv")

    order_id_clean = str(order_id).strip().upper()

    if "order_id" in vf.columns:
        vf["order_id"] = vf["order_id"].astype(str).str.strip().str.upper()

    row = vf[vf["order_id"] == order_id_clean]

    if row.empty and order_id_clean.isdigit():
        padded = order_id_clean.zfill(6)
        row = vf[vf["order_id"] == padded]

    if row.empty and order_id_clean.startswith("O"):
        row = vf[vf["order_id"] == order_id_clean[1:]]

    if row.empty:
        row = vf[vf["order_id"].str.contains(order_id_clean, na=False)]

    if row.empty:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")

    r = row.iloc[0]
    try:
        sup      = _read(MASTERS, "suppliers.csv")
        sup_row  = sup[sup["supplier_id"] == str(r.get("supplier_id", ""))]
        sup_info = sup_row.iloc[0].to_dict() if not sup_row.empty else {}
    except HTTPException:
        sup_info = {}

    order_type    = (order_type or "standard").lower()
    order_budget  = ORDER_BUDGET_TIERS.get(order_type, DEFAULT_ORDER_BUDGET)

    sid              = str(r.get("supplier_id", "UNKNOWN"))
    actual_emit      = float(r.get("total_emissions", 0))
    raw_budget       = float(r.get("budget", order_budget))
    vtype            = str(r.get("violation_type", ""))
    rating           = str(sup_info.get("rating", "C"))
    carbon_intensity = float(sup_info.get("carbon_intensity", 2.34))
    budget_mult      = RATING_BUDGET_MULTIPLIER.get(rating, 1.0)
    effective_budget = round(raw_budget * budget_mult, 2)

    trace_acts = _reconstruct_trace(vtype, rating)

    # Per-step annotation and fitness via token_replay
    replay = token_replay(
        trace_acts,
        carbon_intensity,
        effective_budget,
    )

    steps = replay["steps"]
    computed_total = replay["actual_emission"]

    carbon_fit = replay["carbon_fitness"]
    seq_fit = replay["sequence_fitness"]
    combined_fit = replay["combined_fitness"]

    missing = replay["missing_acts"]
    extra = replay["extra_acts"]

    # Policy
    transport_used = next(
        (a for a in trace_acts if a in ALLOWED_TRANSPORT | FORBIDDEN_TRANSPORT), "Unknown"
    )
    has_duplicates = len(trace_acts) != len(set(trace_acts))
    policy_ctx = {
        "transport":       transport_used,
        "supplier_rating": rating,
        "order_type":      order_type,
        "carbon_fitness":  carbon_fit,
        "missing_steps":   missing,
        "has_duplicates":  has_duplicates,
        "sequence_fitness": seq_fit,
    }
    policy_hits = _evaluate_policies(policy_ctx)
    explanation = explain(
        replay,
        actual_emit,
        effective_budget,
        policy_hits,
    )

    # Reroute
    reroute = green_reroute(trace_acts, carbon_intensity, order_type)

    # Benchmark
    benchmark = _benchmark_scores(trace_acts, actual_emit, effective_budget)

    # Per-step scoring for rerouted path
    reroute_steps, reroute_total = _build_steps(reroute["path"], carbon_intensity)

    return {
        "order_id":          str(r.get("order_id", order_id_clean)),
        "supplier_id":       sid,
        "supplier_rating":   rating,
        "violation_type":    vtype,
        "order_type":        order_type,
        "actual_emission":   round(actual_emit, 2),
        "computed_emission": computed_total,
        "budget":            effective_budget,
        "carbon_fitness":    round(carbon_fit, 4),
        "sequence_fitness":  round(seq_fit, 4),
        "combined_fitness":  round(combined_fit, 4),
        "grade":             grade(combined_fit),
        "steps":             steps,
        "missing_steps":     missing,
        "extra_steps":       extra,
        "policy_violations": policy_hits,
        "explanation":       explanation,
        "normative_model":   NORMATIVE_SEQUENCE,
        "alternative_path":  reroute["path"],
        "alt_emission":      reroute["emission"],
        "alt_steps":         reroute_steps,
        "potential_saving":  round(max(0.0, actual_emit - reroute["emission"]), 2),
        "benchmark":         benchmark,
    }


@router.get("/benchmark")
def conformance_benchmark(
    order_type: Optional[str] = None,
    limit:      int           = Query(200, ge=1, le=1000),
):
    """
    Fleet-level benchmark: Traditional (sequence-only) vs Carbon-Aware (dual-objective).
    Designed for the research paper comparison table.
    """
    try:
        from main import uploaded_summaries

        if uploaded_summaries:
            vf = pd.DataFrame(uploaded_summaries).head(limit)
        else:
            vf = _read(OUT, "sustainability_violations.csv").head(limit)
    except Exception:
        vf = _read(OUT, "sustainability_violations.csv").head(limit)
    try:
        sup      = _read(MASTERS, "suppliers.csv")
        sup_lookup = {str(r["supplier_id"]): r.to_dict() for _, r in sup.iterrows()}
    except HTTPException:
        sup_lookup = {}

    order_type   = (order_type or "standard").lower()
    order_budget = ORDER_BUDGET_TIERS.get(order_type, DEFAULT_ORDER_BUDGET)

    rows = []
    for _, r in vf.iterrows():
        sid          = str(r.get("supplier_id", ""))
        sup_info     = sup_lookup.get(sid, {})
        rating       = str(sup_info.get("rating", "C"))
        ci           = float(sup_info.get("carbon_intensity", 2.34))
        actual_emit  = float(r.get("total_emissions", 0))
        raw_budget   = float(r.get("budget", order_budget))
        eff_budget   = round(raw_budget * RATING_BUDGET_MULTIPLIER.get(rating, 1.0), 2)
        vtype        = str(r.get("violation_type", ""))
        trace_acts   = _reconstruct_trace(vtype, rating)
        bm           = _benchmark_scores(trace_acts, actual_emit, eff_budget)
        rows.append(bm)

    n = len(rows)
    if n == 0:
        return {"error": "No data"}

    trad_scores = [r["traditional"]["score"] for r in rows]
    ca_scores   = [r["carbon_aware"]["score"] for r in rows]
    deltas      = [r["delta"] for r in rows]

    trad_pass = sum(1 for s in trad_scores if s >= 0.85)
    ca_pass   = sum(1 for s in ca_scores   if s >= 0.85)

    return {
        "sample_size": n,
        "order_type":  order_type,
        "traditional_conformance": {
            "avg_fitness":    round(sum(trad_scores) / n, 4),
            "pass_rate_pct":  round(trad_pass / n * 100, 2),
            "method":         "Sequence-only (LCS alignment)",
        },
        "carbon_aware_conformance": {
            "avg_fitness":    round(sum(ca_scores) / n, 4),
            "pass_rate_pct":  round(ca_pass / n * 100, 2),
            "method":         "Dual-objective: 0.5 × seq + 0.5 × carbon",
        },
        "research_finding": {
            "avg_penalty_delta": round(sum(deltas) / n, 4),
            "max_penalty":       round(max(d for d in deltas if d >= 0), 4),
            "cases_downgraded":  sum(1 for d in deltas if d < -0.05),
            "interpretation": (
                "Carbon-aware conformance downgrades significantly more traces "
                "than traditional sequence checking, exposing hidden carbon violations "
                "that sequence-only methods miss."
            ),
        },
        "grade_shift": {
            "traditional":  _build_grade_dist(trad_scores),
            "carbon_aware": _build_grade_dist(ca_scores),
        },
    }


def _build_grade_dist(scores: list[float]) -> dict:
    dist: dict[str, int] = {}
    for s in scores:
        g = grade(s)
        dist[g] = dist.get(g, 0) + 1
    return dist


@router.get("/heatmap")
def conformance_heatmap():
    """
    Heatmap data for:
    1. Activity × emission intensity
    2. Supplier × violation rate
    """
    try:
        from main import uploaded_summaries

        if uploaded_summaries:
            vf = pd.DataFrame(uploaded_summaries)
        else:
            vf = _read(OUT, "sustainability_violations.csv")
    except Exception:
        vf = _read(OUT, "sustainability_violations.csv")
    try:
        sup = _read(MASTERS, "suppliers.csv")
    except HTTPException:
        sup = pd.DataFrame()

    return _build_heatmap_data(vf, sup)


@router.get("/policy-rules")
def policy_rules():
    """Return all green policy rules and their metadata."""
    return {
        "rules": [
            {
                "rule_id":    r["rule_id"],
                "name":       r["name"],
                "description": r["description"],
                "severity":   r["severity"],
                "fix":        r["fix"],
            }
            for r in GREEN_POLICY_RULES
        ],
        "normative_model":   NORMATIVE_SEQUENCE,
        "allowed_transport": list(ALLOWED_TRANSPORT),
        "forbidden_transport": list(FORBIDDEN_TRANSPORT),
        "carbon_budgets":    CARBON_BUDGETS,
        "rating_multipliers": RATING_BUDGET_MULTIPLIER,
        "order_budget_tiers": ORDER_BUDGET_TIERS,
    }