from sqlalchemy import Column, Integer, String, Float
from database import Base

class EventLog(Base):
    __tablename__ = "event_logs"

    id = Column(Integer, primary_key=True, index=True)
    process_id = Column(String)
    case_id = Column(String)
    activity = Column(String)
    time = Column(Float)
    cost = Column(Float)
    emission = Column(Float)