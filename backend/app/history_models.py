from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class AnalysisStatus(str, Enum):
    COMPLETED = "completed"
    PROCESSING = "processing"
    FAILED = "failed"

class EmailSource(str, Enum):
    MANUAL = "manual"
    GMAIL = "gmail"
    OUTLOOK = "outlook"
    API = "api"

class HistoryItemCreate(BaseModel):
    user_id: str
    email_subject: str
    email_sender: str
    email_content: str
    risk_level: RiskLevel
    risk_score: float = Field(..., ge=0, le=100)
    analysis_result: Dict[str, Any]
    source: EmailSource = EmailSource.MANUAL
    has_attachments: bool = False
    attachment_count: int = 0
    url_count: int = 0
    domain: Optional[str] = None
    status: AnalysisStatus = AnalysisStatus.COMPLETED

class HistoryItemResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    email_subject: str
    email_sender: str
    email_content: str
    risk_level: RiskLevel
    risk_score: float
    analysis_result: Dict[str, Any]
    source: EmailSource
    has_attachments: bool
    attachment_count: int
    url_count: int
    domain: Optional[str]
    status: AnalysisStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class HistoryFilter(BaseModel):
    risk_level: Optional[RiskLevel] = None
    source: Optional[EmailSource] = None
    domain: Optional[str] = None
    has_attachments: Optional[bool] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    search: Optional[str] = None
    limit: int = Field(default=50, le=100)
    offset: int = Field(default=0, ge=0)

class HistoryStats(BaseModel):
    total_count: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    sources: Dict[str, int]
    recent_activity: List[Dict[str, Any]]
