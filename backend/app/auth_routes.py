from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from typing import Optional
from bson import ObjectId
from os import getenv
from os import getenv

from app.db import get_db
from app.auth_models import SignupIn, LoginIn, ForgotIn, ResetIn, GoogleIn, UserOut
from app.security import hash_password, verify_password, create_jwt, verify_jwt, create_reset_token, verify_reset_token
from app.emailer import send_welcome_email, send_reset_email
from app.firebase_client import create_firebase_user, set_firestore_user, verify_firebase_id_token

router = APIRouter()


def _users(db):
    return db["users"]

def _resets(db):
    return db["password_resets"]


@router.post("/signup", response_model=UserOut)
async def signup(payload: SignupIn, db=Depends(get_db)):
    users = _users(db)
    # Ensure unique index on email
    try:
        await users.create_index("email", unique=True)
    except Exception:
        pass
    existing = await users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=400, detail={"field": "email", "message": "Email already registered"})

    pw_hash = hash_password(payload.password)
    created_at = datetime.utcnow()

    # Create in Mongo first
    doc = {
        "email": payload.email,
        "password_hash": pw_hash,
        "created_at": created_at,
        "last_login_at": None,
        "firebase_uid": None,
        "plan": "free",
        "status": "active",
    }
    result = await users.insert_one(doc)

    # Create Firebase user
    uid = create_firebase_user(payload.email, payload.password)
    await users.update_one({"_id": result.inserted_id}, {"$set": {"firebase_uid": uid}})

    # Mirror to Firestore
    set_firestore_user(uid, {
        "email": payload.email,
        "createdAt": created_at.isoformat(),
        "plan": "free",
        "status": "active",
    })

    # Send welcome email
    send_welcome_email(payload.email)

    jwt_token = create_jwt({"sub": str(result.inserted_id), "email": payload.email})

    user = await users.find_one({"_id": result.inserted_id})
    # normalize datetimes and ids for JSON
    payload = {
        "_id": str(user.get("_id")),
        "email": user.get("email"),
        "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
        "last_login_at": user.get("last_login_at").isoformat() if user.get("last_login_at") else None,
        "firebase_uid": user.get("firebase_uid"),
        "plan": user.get("plan", "free"),
        "status": user.get("status", "active"),
        "token": jwt_token,
    }
    return JSONResponse(payload)


@router.post("/login")
async def login(payload: LoginIn, db=Depends(get_db)):
    users = _users(db)
    user = await users.find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail={"field": "password", "message": "Invalid credentials"})

    await users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": datetime.utcnow()}})
    token = create_jwt({"sub": str(user["_id"]), "email": user["email"]})
    return {"token": token}


@router.post("/forgot")
async def forgot(payload: ForgotIn, db=Depends(get_db)):
    users, resets = _users(db), _resets(db)
    user = await users.find_one({"email": payload.email})
    # Always respond 200 for privacy, but only send if exists
    if user:
        jti = str(ObjectId())
        token = create_reset_token(str(user["_id"]), jti)
        await resets.insert_one({
            "jti": jti,
            "user_id": str(user["_id"]),
            "expires_at": datetime.utcnow() + timedelta(minutes=30),
            "used": False,
        })
        link = f"{getenv('APP_URL', 'http://localhost:8080')}/auth-reset.html?token={token}"
        send_reset_email(user["email"], link)
    return {"success": True}


@router.post("/reset")
async def reset(payload: ResetIn, db=Depends(get_db)):
    users, resets = _users(db), _resets(db)
    data = verify_reset_token(payload.token)
    if not data:
        raise HTTPException(status_code=400, detail={"field": "token", "message": "Invalid or expired token"})

    rec = await resets.find_one({"jti": data.get("jti")})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail={"field": "token", "message": "Token already used or invalid"})

    user_id = data.get("sub")
    pw_hash = hash_password(payload.password)
    await users.update_one({"_id": ObjectId(user_id)}, {"$set": {"password_hash": pw_hash}})
    await resets.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return {"success": True}


@router.get("/me", response_model=UserOut)
async def me(authorization: Optional[str] = Header(None), db=Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    data = verify_jwt(token)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid token")

    users = _users(db)
    user = await users.find_one({"_id": ObjectId(data["sub"])})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user["_id"] = str(user["_id"])  # alias for model
    return user


@router.post("/google")
async def login_with_google(payload: GoogleIn, db=Depends(get_db)):
    """Accepts Firebase ID token from the client, verifies, issues JWT, and
    ensures Mongo/Firestore user exists."""
    claims = verify_firebase_id_token(payload.token)
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = claims.get("email")
    uid = claims.get("uid") or claims.get("user_id")
    if not email:
        raise HTTPException(status_code=400, detail="Email not present in token")

    users = _users(db)
    user = await users.find_one({"email": email})
    now = datetime.utcnow()
    if not user:
        doc = {
            "email": email,
            "password_hash": "",
            "created_at": now,
            "last_login_at": now,
            "firebase_uid": uid or f"mock_{hash(email) & 0xffffffff}",
            "plan": "free",
            "status": "active",
        }
        result = await users.insert_one(doc)
        user_id = result.inserted_id
    else:
        user_id = user["_id"]
        await users.update_one({"_id": user_id}, {"$set": {"last_login_at": now}})

    # Mirror to Firestore (best-effort)
    set_firestore_user(uid or f"mock_{hash(email) & 0xffffffff}", {
        "email": email,
        "createdAt": now.isoformat(),
        "plan": "free",
        "status": "active",
    })

    token_jwt = create_jwt({"sub": str(user_id), "email": email})
    return {"token": token_jwt}
