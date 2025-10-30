from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timedelta
from app.db import get_db
from app.threats_models import (
    ThreatCreate, ThreatResponse, ThreatUpdate, ThreatFilter,
    ThreatStats, ThreatFeedItem, AttackPattern,
    ThreatType, ThreatSeverity, ThreatStatus, ThreatSource
)
from pymongo.database import Database
from bson import ObjectId
import logging
import random

logger = logging.getLogger(__name__)
router = APIRouter()

def _threats_collection(db: Database):
    return db.threats

@router.post("/threats", response_model=ThreatResponse)
async def create_threat(
    threat: ThreatCreate,
    db: Database = Depends(get_db)
):
    """Create a new threat"""
    try:
        collection = _threats_collection(db)
        
        now = datetime.utcnow()
        threat_dict = threat.dict()
        threat_dict.update({
            "created_at": now,
            "updated_at": now
        })
        
        result = collection.insert_one(threat_dict)
        
        created_threat = collection.find_one({"_id": result.inserted_id})
        if not created_threat:
            raise HTTPException(status_code=500, detail="Failed to create threat")
        
        created_threat["_id"] = str(created_threat["_id"])
        return ThreatResponse(**created_threat)
        
    except Exception as e:
        logger.error(f"Error creating threat: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/threats", response_model=List[ThreatResponse])
async def get_threats(
    user_id: str,
    threat_type: Optional[ThreatType] = None,
    severity: Optional[ThreatSeverity] = None,
    status: Optional[ThreatStatus] = None,
    source: Optional[ThreatSource] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: Database = Depends(get_db)
):
    """Get filtered threats"""
    try:
        collection = _threats_collection(db)
        
        filter_query = {"user_id": user_id}
        
        if threat_type:
            filter_query["threat_type"] = threat_type.value
        if severity:
            filter_query["severity"] = severity.value
        if status:
            filter_query["status"] = status.value
        if source:
            filter_query["source"] = source.value
            
        if date_from or date_to:
            date_filter = {}
            if date_from:
                date_filter["$gte"] = date_from
            if date_to:
                date_filter["$lte"] = date_to
            filter_query["created_at"] = date_filter
            
        if search:
            filter_query["$or"] = [
                {"title": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]
        
        cursor = collection.find(filter_query).sort("created_at", -1).skip(offset).limit(limit)
        threats = await cursor.to_list(length=limit)
        
        for threat in threats:
            threat["_id"] = str(threat["_id"])
        
        return [ThreatResponse(**threat) for threat in threats]
        
    except Exception as e:
        logger.error(f"Error fetching threats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/threats/stats", response_model=ThreatStats)
async def get_threat_stats(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get threat statistics"""
    try:
        collection = _threats_collection(db)
        
        # Get status distribution
        status_pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_counts = await collection.aggregate(status_pipeline).to_list(length=None)
        status_stats = {item["_id"]: item["count"] for item in status_counts}
        
        # Get severity distribution
        severity_pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": "$severity", "count": {"$sum": 1}}}
        ]
        severity_counts = await collection.aggregate(severity_pipeline).to_list(length=None)
        severity_stats = {item["_id"]: item["count"] for item in severity_counts}
        
        # Get type distribution
        type_pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": "$threat_type", "count": {"$sum": 1}}}
        ]
        type_counts = await collection.aggregate(type_pipeline).to_list(length=None)
        type_stats = {item["_id"]: item["count"] for item in type_counts}
        
        # Get recent threats
        recent_threats = await collection.find(
            {"user_id": user_id}
        ).sort("created_at", -1).limit(5).to_list(length=5)
        
        recent_activity = []
        for threat in recent_threats:
            recent_activity.append({
                "id": str(threat["_id"]),
                "title": threat["title"],
                "severity": threat["severity"],
                "type": threat["threat_type"],
                "created_at": threat["created_at"].isoformat()
            })
        
        total_threats = sum(status_stats.values())
        
        return ThreatStats(
            total_threats=total_threats,
            active_threats=status_stats.get("active", 0),
            blocked_threats=status_stats.get("blocked", 0),
            resolved_threats=status_stats.get("resolved", 0),
            severity_distribution=severity_stats,
            type_distribution=type_stats,
            recent_threats=recent_activity
        )
        
    except Exception as e:
        logger.error(f"Error fetching threat stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/threats/feed", response_model=List[ThreatFeedItem])
async def get_threat_feed(
    limit: int = Query(default=20, le=50),
    db: Database = Depends(get_db)
):
    """Get live threat intelligence feed"""
    try:
        # For now, generate mock threat feed data
        # In production, this would connect to real threat intelligence sources
        
        threat_types = list(ThreatType)
        severities = list(ThreatSeverity)
        sources = ["VirusTotal", "AlienVault", "Shodan", "ThreatCrowd", "Internal"]
        
        feed_items = []
        for i in range(limit):
            threat_type = random.choice(threat_types)
            severity = random.choice(severities)
            
            # Generate realistic threat data
            titles = {
                ThreatType.PHISHING: [
                    "Suspicious login attempt detected",
                    "Fake banking website identified",
                    "Credential harvesting campaign active"
                ],
                ThreatType.MALWARE: [
                    "New ransomware variant detected",
                    "Trojan distribution campaign",
                    "Malicious attachment identified"
                ],
                ThreatType.SPAM: [
                    "Mass spam campaign detected",
                    "Suspicious bulk email activity",
                    "Unwanted promotional content"
                ]
            }
            
            title = random.choice(titles.get(threat_type, ["Unknown threat detected"]))
            
            feed_items.append(ThreatFeedItem(
                id=f"feed_{i}_{int(datetime.utcnow().timestamp())}",
                threat_type=threat_type,
                severity=severity,
                title=title,
                description=f"Threat intelligence indicates {threat_type.value} activity",
                timestamp=datetime.utcnow() - timedelta(minutes=random.randint(1, 60)),
                source=random.choice(sources),
                indicators={
                    "domains": [f"suspicious-{i}.com"],
                    "ips": [f"192.168.{random.randint(1, 255)}.{random.randint(1, 255)}"],
                    "confidence": random.randint(70, 95)
                }
            ))
        
        return sorted(feed_items, key=lambda x: x.timestamp, reverse=True)
        
    except Exception as e:
        logger.error(f"Error fetching threat feed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/threats/attack-patterns", response_model=List[AttackPattern])
async def get_attack_patterns(
    user_id: str,
    days: int = Query(default=30, le=90),
    db: Database = Depends(get_db)
):
    """Get attack pattern analysis"""
    try:
        collection = _threats_collection(db)
        
        # Get threat type distribution for the specified period
        date_from = datetime.utcnow() - timedelta(days=days)
        
        pipeline = [
            {"$match": {
                "user_id": user_id,
                "created_at": {"$gte": date_from}
            }},
            {"$group": {
                "_id": "$threat_type",
                "count": {"$sum": 1}
            }},
            {"$sort": {"count": -1}}
        ]
        
        results = await collection.aggregate(pipeline).to_list(length=None)
        total_threats = sum(item["count"] for item in results)
        
        patterns = []
        for item in results:
            count = item["count"]
            percentage = (count / total_threats * 100) if total_threats > 0 else 0
            
            # Mock trend calculation (in production, compare with previous period)
            trend = random.choice(["up", "down", "stable"])
            
            patterns.append(AttackPattern(
                pattern_type=item["_id"],
                count=count,
                trend=trend,
                percentage=round(percentage, 1)
            ))
        
        return patterns
        
    except Exception as e:
        logger.error(f"Error fetching attack patterns: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/threats/{threat_id}", response_model=ThreatResponse)
async def update_threat(
    threat_id: str,
    threat_update: ThreatUpdate,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Update a threat"""
    try:
        collection = _threats_collection(db)
        
        try:
            obj_id = ObjectId(threat_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid threat ID")
        
        update_data = {k: v for k, v in threat_update.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        if threat_update.status in [ThreatStatus.RESOLVED, ThreatStatus.BLOCKED]:
            update_data["resolved_at"] = datetime.utcnow()
        
        result = collection.update_one(
            {"_id": obj_id, "user_id": user_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Threat not found")
        
        updated_threat = collection.find_one({"_id": obj_id})
        updated_threat["_id"] = str(updated_threat["_id"])
        
        return ThreatResponse(**updated_threat)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating threat: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/threats/{threat_id}")
async def delete_threat(
    threat_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Delete a threat"""
    try:
        collection = _threats_collection(db)
        
        try:
            obj_id = ObjectId(threat_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid threat ID")
        
        result = collection.delete_one({"_id": obj_id, "user_id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Threat not found")
        
        return {"message": "Threat deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting threat: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
