from datetime import datetime, timedelta
from os import getenv
from typing import Any, Dict, Optional

from jose import jwt, JWTError
import bcrypt

JWT_SECRET = getenv("JWT_SECRET", "dev_secret_change_me")
JWT_ALG = "HS256"
JWT_EXPIRE_DAYS = int(getenv("JWT_EXPIRE_DAYS", "7"))
RESET_TOKEN_TTL_MIN = int(getenv("RESET_TOKEN_TTL_MIN", "30"))


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def create_jwt(payload: Dict[str, Any], expires_days: int = JWT_EXPIRE_DAYS) -> str:
    to_encode = payload.copy()
    exp = datetime.utcnow() + timedelta(days=expires_days)
    to_encode.update({"exp": exp})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALG)


def verify_jwt(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        return None


def create_reset_token(user_id: str, jti: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_TTL_MIN)
    payload = {"sub": user_id, "jti": jti, "exp": exp, "typ": "reset"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def verify_reset_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if data.get("typ") != "reset":
            return None
        return data
    except JWTError:
        return None
