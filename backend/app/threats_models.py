from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class ThreatType(str, Enum):
    PHISHING = "phishing"
    MALWARE = "malware"
    SPAM = "spam"
    SPOOFING = "spoofing"
    BEC = "bec"  # Business Email Compromise
    RANSOMWARE = "ransomware"
    CREDENTIAL_HARVESTING = "credential_harvesting"

class ThreatSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class ThreatStatus(str, Enum):
    ACTIVE = "active"
    BLOCKED = "blocked"
    RESOLVED = "resolved"
    INVESTIGATING = "investigating"

class ThreatSource(str, Enum):
    EMAIL_ANALYSIS = "email_analysis"
    THREAT_INTEL = "threat_intel"
    USER_REPORT = "user_report"
    AUTOMATED_SCAN = "automated_scan"

class ThreatCreate(BaseModel):
    user_id: str
    threat_type: ThreatType
    severity: ThreatSeverity
    title: str
    description: str
    source: ThreatSource
    indicators: Dict[str, Any] = {}  # IOCs, domains, IPs, etc.
    affected_emails: List[str] = []
    status: ThreatStatus = ThreatStatus.ACTIVE
    metadata: Dict[str, Any] = {}

class ThreatResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    threat_type: ThreatType
    severity: ThreatSeverity
    title: str
    description: str
    source: ThreatSource
    indicators: Dict[str, Any]
    affected_emails: List[str]
    status: ThreatStatus
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ThreatUpdate(BaseModel):
    status: Optional[ThreatStatus] = None
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ThreatFilter(BaseModel):
    threat_type: Optional[ThreatType] = None
    severity: Optional[ThreatSeverity] = None
    status: Optional[ThreatStatus] = None
    source: Optional[ThreatSource] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    search: Optional[str] = None
    limit: int = Field(default=50, le=100)
    offset: int = Field(default=0, ge=0)

class ThreatStats(BaseModel):
    total_threats: int
    active_threats: int
    blocked_threats: int
    resolved_threats: int
    severity_distribution: Dict[str, int]
    type_distribution: Dict[str, int]
    recent_threats: List[Dict[str, Any]]

class ThreatFeedItem(BaseModel):
    id: str
    threat_type: ThreatType
    severity: ThreatSeverity
    title: str
    description: str
    timestamp: datetime
    source: str
    indicators: Dict[str, Any]

class AttackPattern(BaseModel):
    pattern_type: str
    count: int
    trend: str  # "up", "down", "stable"
    percentage: float
