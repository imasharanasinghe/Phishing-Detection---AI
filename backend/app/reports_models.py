from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum

class ReportType(str, Enum):
    SECURITY_OVERVIEW = "security_overview"
    THREAT_ANALYSIS = "threat_analysis"
    COMPLIANCE = "compliance"
    EXECUTIVE_SUMMARY = "executive_summary"
    CUSTOM = "custom"

class ReportFormat(str, Enum):
    PDF = "pdf"
    CSV = "csv"
    JSON = "json"
    EXCEL = "excel"

class ReportStatus(str, Enum):
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"

class ReportFrequency(str, Enum):
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"

class DateRange(str, Enum):
    LAST_7_DAYS = "last_7_days"
    LAST_30_DAYS = "last_30_days"
    LAST_90_DAYS = "last_90_days"
    LAST_YEAR = "last_year"
    CUSTOM = "custom"

class ReportOptions(BaseModel):
    include_charts: bool = True
    include_raw_data: bool = False
    include_recommendations: bool = True
    group_by_risk_level: bool = True
    group_by_source: bool = False
    custom_filters: Dict[str, Any] = {}

class ReportCreate(BaseModel):
    user_id: str
    name: str
    description: Optional[str] = None
    report_type: ReportType
    format: ReportFormat = ReportFormat.PDF
    date_range: DateRange = DateRange.LAST_30_DAYS
    custom_date_from: Optional[datetime] = None
    custom_date_to: Optional[datetime] = None
    options: ReportOptions = ReportOptions()
    recipients: List[str] = []  # Email addresses
    frequency: ReportFrequency = ReportFrequency.ONCE
    next_run: Optional[datetime] = None

class ReportResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    name: str
    description: Optional[str]
    report_type: ReportType
    format: ReportFormat
    date_range: DateRange
    custom_date_from: Optional[datetime]
    custom_date_to: Optional[datetime]
    options: ReportOptions
    recipients: List[str]
    frequency: ReportFrequency
    next_run: Optional[datetime]
    status: ReportStatus
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ReportUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    recipients: Optional[List[str]] = None
    frequency: Optional[ReportFrequency] = None
    next_run: Optional[datetime] = None
    status: Optional[ReportStatus] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    completed_at: Optional[datetime] = None

class ReportFilter(BaseModel):
    report_type: Optional[ReportType] = None
    status: Optional[ReportStatus] = None
    frequency: Optional[ReportFrequency] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    limit: int = Field(default=50, le=100)
    offset: int = Field(default=0, ge=0)

class ReportStats(BaseModel):
    total_reports: int
    completed_reports: int
    failed_reports: int
    scheduled_reports: int
    recent_reports: List[Dict[str, Any]]

class ReportData(BaseModel):
    """Data structure for report content"""
    title: str
    generated_at: datetime
    date_range: str
    summary: Dict[str, Any]
    sections: List[Dict[str, Any]]
    charts: List[Dict[str, Any]] = []
    raw_data: Optional[List[Dict[str, Any]]] = None
    recommendations: List[str] = []

class ScheduledReportCreate(BaseModel):
    user_id: str
    name: str
    report_type: ReportType
    format: ReportFormat
    frequency: ReportFrequency
    recipients: List[str]
    options: ReportOptions = ReportOptions()
    next_run: datetime

class ScheduledReportResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    name: str
    report_type: ReportType
    format: ReportFormat
    frequency: ReportFrequency
    recipients: List[str]
    options: ReportOptions
    next_run: datetime
    last_run: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
