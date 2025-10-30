
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime

class AnalyzeRequest(BaseModel):
    email_text: str

class AnalyzeResponse(BaseModel):
    score: float
    level: str
    reason: str
    alert_summary: str
    parsed: Optional[Dict[str, Any]]

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
    
    class Config:
        validate_by_name = True

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation: List[ChatMessage] = []
    page_context: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    refused: bool = False


class UserCreateRequest(BaseModel):
    uid: str = Field(..., description="Firebase user ID")
    email: str = Field(..., description="User email")
    displayName: Optional[str] = Field(None, description="User display name")
    photoURL: Optional[str] = Field(None, description="User photo URL")
    provider: str = Field(..., description="Authentication provider")
    createdAt: str = Field(..., description="Account creation timestamp")

class UserResponse(BaseModel):
    uid: str
    email: str
    displayName: Optional[str] = None
    photoURL: Optional[str] = None
    provider: str
    createdAt: datetime
    emailsAnalyzed: int = 0
    lastLogin: Optional[datetime] = None

    class Config:
        validate_by_name = True
