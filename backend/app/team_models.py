from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    AGENT = "agent"
    CLIENT = "client"
    VIEWER = "viewer"

class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"
    SUSPENDED = "suspended"

class InvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    CANCELLED = "cancelled"

class Permission(str, Enum):
    VIEW_DASHBOARD = "view_dashboard"
    ANALYZE_EMAILS = "analyze_emails"
    VIEW_HISTORY = "view_history"
    MANAGE_THREATS = "manage_threats"
    GENERATE_REPORTS = "generate_reports"
    MANAGE_INTEGRATIONS = "manage_integrations"
    MANAGE_TEAM = "manage_team"
    MANAGE_BILLING = "manage_billing"
    ADMIN_SETTINGS = "admin_settings"

class TeamMemberCreate(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    role: UserRole
    permissions: List[Permission] = []
    department: Optional[str] = None
    job_title: Optional[str] = None

class TeamMemberResponse(BaseModel):
    id: str = Field(alias="_id")
    email: str
    first_name: str
    last_name: str
    role: UserRole
    status: UserStatus
    permissions: List[Permission]
    department: Optional[str]
    job_title: Optional[str]
    avatar_url: Optional[str] = None
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    created_by: str  # User ID who created this member

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class TeamMemberUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    permissions: Optional[List[Permission]] = None
    department: Optional[str] = None
    job_title: Optional[str] = None

class InvitationCreate(BaseModel):
    email: EmailStr
    role: UserRole
    permissions: List[Permission] = []
    message: Optional[str] = None
    expires_at: Optional[datetime] = None

class InvitationResponse(BaseModel):
    id: str = Field(alias="_id")
    email: str
    role: UserRole
    permissions: List[Permission]
    message: Optional[str]
    status: InvitationStatus
    token: str
    expires_at: datetime
    created_at: datetime
    created_by: str
    accepted_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class TeamFilter(BaseModel):
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    department: Optional[str] = None
    search: Optional[str] = None
    limit: int = Field(default=50, le=100)
    offset: int = Field(default=0, ge=0)

class TeamStats(BaseModel):
    total_members: int
    active_members: int
    pending_invitations: int
    role_distribution: Dict[str, int]
    recent_activity: List[Dict[str, Any]]

class ActivityLog(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    action: str
    target_type: str  # "member", "invitation", "role", etc.
    target_id: Optional[str] = None
    details: Dict[str, Any]
    timestamp: datetime
    ip_address: Optional[str] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class RolePermissions(BaseModel):
    role: UserRole
    permissions: List[Permission]
    description: str

# Default role permissions
DEFAULT_ROLE_PERMISSIONS = {
    UserRole.ADMIN: [
        Permission.VIEW_DASHBOARD,
        Permission.ANALYZE_EMAILS,
        Permission.VIEW_HISTORY,
        Permission.MANAGE_THREATS,
        Permission.GENERATE_REPORTS,
        Permission.MANAGE_INTEGRATIONS,
        Permission.MANAGE_TEAM,
        Permission.MANAGE_BILLING,
        Permission.ADMIN_SETTINGS
    ],
    UserRole.AGENT: [
        Permission.VIEW_DASHBOARD,
        Permission.ANALYZE_EMAILS,
        Permission.VIEW_HISTORY,
        Permission.MANAGE_THREATS,
        Permission.GENERATE_REPORTS
    ],
    UserRole.CLIENT: [
        Permission.VIEW_DASHBOARD,
        Permission.ANALYZE_EMAILS,
        Permission.VIEW_HISTORY,
        Permission.GENERATE_REPORTS
    ],
    UserRole.VIEWER: [
        Permission.VIEW_DASHBOARD,
        Permission.VIEW_HISTORY
    ]
}
