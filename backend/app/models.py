
from typing import Optional, Any, Dict, List
from pydantic import BaseModel, Field
from datetime import datetime

class User(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email: str
    password_hash: Optional[str] = None
    plan: str = "free"

class EmailRecord(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    parsed_data: Optional[Dict[str, Any]] = None
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    alert_summary: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
