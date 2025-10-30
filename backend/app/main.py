
from fastapi import FastAPI, Depends, HTTPException
from starlette.middleware.cors import CORSMiddleware
from app.schemas import AnalyzeRequest, AnalyzeResponse, EmailRecord, UserCreateRequest, UserResponse
from app.db import get_db
from app.agents.email_parser import parse_email
from app.agents.risk_scorer import score
from app.agents.alert_generator import make_alert
from app.news import router as news_router
from app.auth_routes import router as auth_router
from app.history_routes import router as history_router
from app.threats_routes import router as threats_router
from app.reports_routes import router as reports_router
from app.team_routes import router as team_router
from app.integrations_routes import router as integrations_router
from app.billing_routes import router as billing_router
from app.chat_routes import router as chat_router
from datetime import datetime
from typing import List, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Phishing Detection AI Backend",
    description="AI-powered phishing detection system with ML and rule-based analysis",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(\[[0-9a-fA-F:]+\]|localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(news_router, prefix="/api", tags=["news"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(history_router, prefix="/api", tags=["history"])
app.include_router(threats_router, prefix="/api", tags=["threats"])
app.include_router(reports_router, prefix="/api", tags=["reports"])
app.include_router(team_router, prefix="/api", tags=["team"])
app.include_router(integrations_router, prefix="/api", tags=["integrations"])
app.include_router(billing_router, prefix="/api", tags=["billing"])
app.include_router(chat_router, prefix="/api", tags=["chat"])

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "ok": True, 
        "timestamp": datetime.utcnow().isoformat(),
        "service": "phishing-detection-ai"
    }

@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest, db=Depends(get_db), user_id: Optional[str] = None):
    """
    Analyze email for phishing risk.
    
    Args:
        payload: Email text to analyze
        db: MongoDB database connection
        
    Returns:
        Analysis results with risk score, level, and alert summary
    """
    try:
        # Parse email
        logger.info("Starting email analysis")
        parsed = parse_email(payload.email_text)
        
        # Score risk
        score_value, level, reason = score(parsed)
        
        # Generate alert
        summary = make_alert(score_value, level, reason, parsed)
        
        # Store in MongoDB
        email_record = {
            "subject": parsed.get("headers", {}).get("subject"),
            "body": parsed.get("body_text"),
            "parsed_data": parsed,
            "risk_score": score_value,
            "risk_level": level,
            "alert_summary": summary,
            "timestamp": datetime.utcnow(),
            "user_id": user_id
        }
        
        try:
            result = await db.emails.insert_one(email_record)
            logger.info(f"Email analysis stored with ID: {result.inserted_id}")
            
            # Also create history entry if user_id provided
            if user_id:
                from app.history_models import HistoryItemCreate, RiskLevel, EmailSource
                
                # Map risk level
                risk_level_map = {
                    "low": RiskLevel.LOW,
                    "medium": RiskLevel.MEDIUM,
                    "high": RiskLevel.HIGH
                }
                
                history_item = HistoryItemCreate(
                    user_id=user_id,
                    email_subject=parsed.get("headers", {}).get("subject", "No Subject"),
                    email_sender=parsed.get("headers", {}).get("from", "Unknown Sender"),
                    email_content=payload.email_text,
                    risk_level=risk_level_map.get(level, RiskLevel.LOW),
                    risk_score=score_value,
                    analysis_result={
                        "parsed_data": parsed,
                        "risk_score": score_value,
                        "risk_level": level,
                        "alert_summary": summary
                    },
                    source=EmailSource.MANUAL,
                    has_attachments=len(parsed.get("attachments", [])) > 0,
                    attachment_count=len(parsed.get("attachments", [])),
                    url_count=len(parsed.get("urls", [])),
                    domain=parsed.get("sender_domain")
                )
                
                history_collection = db.analysis_history
                now = datetime.utcnow()
                history_dict = history_item.dict()
                history_dict.update({
                    "created_at": now,
                    "updated_at": now
                })
                await history_collection.insert_one(history_dict)
                logger.info(f"History entry created for user: {user_id}")
                
        except Exception as e:
            logger.warning(f"Failed to store email analysis: {e}")
            # Continue without failing the request
        
        return AnalyzeResponse(
            score=score_value,
            level=level,
            reason=reason,
            alert_summary=summary,
            parsed=parsed
        )
        
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/api/gmail/parse", response_model=AnalyzeResponse)
async def gmail_parse(payload: AnalyzeRequest, db=Depends(get_db)):
    """
    Parse Gmail content for phishing analysis.
    
    This endpoint is designed for Chrome extension integration.
    Future implementation will include OAuth token verification and Gmail API integration.
    
    Args:
        payload: Gmail content to analyze
        db: MongoDB database connection
        
    Returns:
        Analysis results
    """
    # For now, reuse the same analyzer
    # Future: verify OAuth tokens, fetch via Gmail API
    return await analyze(payload, db)

@app.get("/api/emails", response_model=List[EmailRecord])
async def get_emails(
    limit: int = 50,
    skip: int = 0,
    risk_level: Optional[str] = None,
    db=Depends(get_db)
):
    """
    Retrieve analyzed emails with optional filtering.
    
    Args:
        limit: Maximum number of emails to return
        skip: Number of emails to skip
        risk_level: Filter by risk level (Low/Medium/High)
        db: MongoDB database connection
        
    Returns:
        List of email records
    """
    try:
        query = {}
        if risk_level:
            query["risk_level"] = risk_level
        
        cursor = db.emails.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        emails = await cursor.to_list(length=limit)
        
        # Convert ObjectId to string for JSON serialization
        for email in emails:
            email["id"] = str(email["_id"])
            del email["_id"]
        
        return emails
        
    except Exception as e:
        logger.error(f"Failed to retrieve emails: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve emails")

@app.get("/api/stats")
async def get_stats(db=Depends(get_db)):
    """
    Get analysis statistics.
    
    Args:
        db: MongoDB database connection
        
    Returns:
        Statistics about analyzed emails
    """
    try:
        total_emails = await db.emails.count_documents({})
        
        # Count by risk level
        high_count = await db.emails.count_documents({"risk_level": "High"})
        medium_count = await db.emails.count_documents({"risk_level": "Medium"})
        low_count = await db.emails.count_documents({"risk_level": "Low"})
        
        # Average risk score
        pipeline = [
            {"$group": {"_id": None, "avg_score": {"$avg": "$risk_score"}}}
        ]
        avg_score_result = await db.emails.aggregate(pipeline).to_list(1)
        avg_score = avg_score_result[0]["avg_score"] if avg_score_result else 0.0
        
        return {
            "total_emails": total_emails,
            "risk_levels": {
                "high": high_count,
                "medium": medium_count,
                "low": low_count
            },
            "average_risk_score": round(avg_score, 3)
        }
        
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")

@app.post("/api/users", response_model=UserResponse)
async def create_user(user_data: UserCreateRequest, db=Depends(get_db)):
    """Create or update user in MongoDB"""
    try:
        users_collection = db["users"]
        
        # Check if user already exists
        existing_user = await users_collection.find_one({"uid": user_data.uid})
        
        if existing_user:
            # Update last login
            await users_collection.update_one(
                {"uid": user_data.uid},
                {"$set": {"lastLogin": datetime.utcnow()}}
            )
            existing_user["lastLogin"] = datetime.utcnow()
            return UserResponse(**existing_user)
        
        # Create new user
        user_doc = {
            "uid": user_data.uid,
            "email": user_data.email,
            "displayName": user_data.displayName,
            "photoURL": user_data.photoURL,
            "provider": user_data.provider,
            "createdAt": datetime.fromisoformat(user_data.createdAt.replace('Z', '+00:00')),
            "emailsAnalyzed": 0,
            "lastLogin": datetime.utcnow()
        }
        
        result = await users_collection.insert_one(user_doc)
        user_doc["_id"] = str(result.inserted_id)
        
        return UserResponse(**user_doc)
        
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail="Failed to create user")

@app.get("/api/users/{uid}", response_model=UserResponse)
async def get_user(uid: str, db=Depends(get_db)):
    """Get user by UID"""
    try:
        users_collection = db["users"]
        user = await users_collection.find_one({"uid": uid})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserResponse(**user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user: {e}")
        raise HTTPException(status_code=500, detail="Failed to get user")

@app.put("/api/users/{uid}/emails-analyzed")
async def update_emails_analyzed(uid: str, db=Depends(get_db)):
    """Increment emails analyzed count for user"""
    try:
        users_collection = db["users"]
        
        result = await users_collection.update_one(
            {"uid": uid},
            {"$inc": {"emailsAnalyzed": 1}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {"success": True, "message": "Emails analyzed count updated"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating emails analyzed: {e}")
        raise HTTPException(status_code=500, detail="Failed to update emails analyzed count")
