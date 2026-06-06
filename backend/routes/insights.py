from fastapi import APIRouter
from database import SessionLocal
from models import EventLog
from engine.mining import compute_insights

router = APIRouter()

@router.get("/insights/{process_id}")
def get_insights(process_id: str):
    db = SessionLocal()

    events = db.query(EventLog).filter(EventLog.process_id == process_id).all()

    # SAFETY: empty dataset handling
    if not events:
        return {"insights": []}

    data = [
        {
            "case_id": e.case_id,
            "activity": e.activity,
            "time": e.time,
            "cost": e.cost,
            "emission": e.emission
        }
        for e in events
    ]

    result = compute_insights(data)

    # ENSURE CONSISTENT API SHAPE FOR FRONTEND
    return {
        "insights": result,
        "process_id": process_id
    }