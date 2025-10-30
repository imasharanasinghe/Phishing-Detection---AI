from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class IntegrationType(str, Enum):
    EMAIL_PROVIDER = "email_provider"
    SECURITY_TOOL = "security_tool"
    COMMUNICATION = "communication"
    AUTOMATION = "automation"
    CUSTOM_API = "custom_api"

class IntegrationStatus(str, Enum):
    AVAILABLE = "available"
    CONNECTED = "connected"
    ERROR = "error"
    CONFIGURING = "configuring"

class IntegrationCreate(BaseModel):
    user_id: str
    name: str
    type: IntegrationType
    provider: str  # e.g., "gmail", "slack", "splunk"
    config: Dict[str, Any]
    is_active: bool = True

class IntegrationResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    name: str
    type: IntegrationType
    provider: str
    status: IntegrationStatus
    config: Dict[str, Any]
    is_active: bool
    last_sync: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    status: Optional[IntegrationStatus] = None
    error_message: Optional[str] = None
    last_sync: Optional[datetime] = None

class IntegrationStats(BaseModel):
    total_integrations: int
    active_integrations: int
    healthy_integrations: int
    error_integrations: int
    api_calls_today: int
    data_transferred_mb: float

class ApiUsage(BaseModel):
    date: datetime
    calls: int
    data_mb: float
    success_rate: float

class IntegrationHealth(BaseModel):
    integration_id: str
    provider: str
    status: IntegrationStatus
    last_check: datetime
    response_time_ms: Optional[int] = None
    error_count: int = 0
