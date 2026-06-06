def optimize(insights):
    worst = max(insights["insights"], key=lambda x: x["score"])

    recommendation = "System optimal"

    if worst["emission"] > 70:
        recommendation = f"Replace {worst['activity']} with low-emission alternative"

    return {
        "worst": worst,
        "recommendation": recommendation
    }