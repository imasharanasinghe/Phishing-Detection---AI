from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional
from datetime import datetime
import re

PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$")

class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not PASSWORD_REGEX.match(v):
            raise ValueError("Password must be ≥8 chars with upper, lower, and a number")
        return v

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not PASSWORD_REGEX.match(v):
            raise ValueError("Password must be ≥8 chars with upper, lower, and a number")
        return v

class GoogleIn(BaseModel):
    token: str

class UserOut(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email: EmailStr
    created_at: datetime
    last_login_at: Optional[datetime] = None
    firebase_uid: Optional[str] = None
    plan: str = "free"
    status: str = "active"

    class Config:
        validate_by_name = True
        populate_by_name = True
