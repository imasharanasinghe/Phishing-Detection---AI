from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timedelta
from app.db import get_db
from app.history_models import (
    HistoryItemCreate, HistoryItemResponse, HistoryFilter, 
    HistoryStats, RiskLevel, EmailSource, AnalysisStatus
)
from pymongo.database import Database
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

def _history_collection(db: Database):
    return db.analysis_history

@router.post("/history", response_model=HistoryItemResponse)
async def create_history_item(
    item: HistoryItemCreate,
    db: Database = Depends(get_db)
):
    """Create a new analysis history item"""
    try:
        collection = _history_collection(db)
        
        # Add timestamps
        now = datetime.utcnow()
        item_dict = item.dict()
        item_dict.update({
            "created_at": now,
            "updated_at": now
        })
        
        result = collection.insert_one(item_dict)
        
        # Retrieve the created item
        created_item = collection.find_one({"_id": result.inserted_id})
        if not created_item:
            raise HTTPException(status_code=500, detail="Failed to create history item")
        
        # Convert ObjectId to string
        created_item["_id"] = str(created_item["_id"])
        
        return HistoryItemResponse(**created_item)
        
    except Exception as e:
        logger.error(f"Error creating history item: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/history", response_model=List[HistoryItemResponse])
async def get_history_items(
    user_id: str,
    risk_level: Optional[RiskLevel] = None,
    source: Optional[EmailSource] = None,
    domain: Optional[str] = None,
    has_attachments: Optional[bool] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: Database = Depends(get_db)
):
    """Get filtered analysis history items"""
    try:
        collection = _history_collection(db)
        
        # Build filter query
        filter_query = {"user_id": user_id}
        
        if risk_level:
            filter_query["risk_level"] = risk_level.value
        
        if source:
            filter_query["source"] = source.value
            
        if domain:
            filter_query["domain"] = {"$regex": domain, "$options": "i"}
            
        if has_attachments is not None:
            filter_query["has_attachments"] = has_attachments
            
        if date_from or date_to:
            date_filter = {}
            if date_from:
                date_filter["$gte"] = date_from
            if date_to:
                date_filter["$lte"] = date_to
            filter_query["created_at"] = date_filter
            
        if search:
            filter_query["$or"] = [
                {"email_subject": {"$regex": search, "$options": "i"}},
                {"email_sender": {"$regex": search, "$options": "i"}},
                {"email_content": {"$regex": search, "$options": "i"}}
            ]
        
        # Execute query with pagination
        cursor = collection.find(filter_query).sort("created_at", -1).skip(offset).limit(limit)
        items = await cursor.to_list(length=limit)
        
        # Convert ObjectIds to strings
        for item in items:
            item["_id"] = str(item["_id"])
        
        return [HistoryItemResponse(**item) for item in items]
        
    except Exception as e:
        logger.error(f"Error fetching history items: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/history/stats", response_model=HistoryStats)
async def get_history_stats(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get analysis history statistics"""
    try:
        collection = _history_collection(db)
        
        # Get total counts by risk level
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {
                "_id": "$risk_level",
                "count": {"$sum": 1}
            }}
        ]
        
        risk_counts = await collection.aggregate(pipeline).to_list(length=None)
        risk_stats = {item["_id"]: item["count"] for item in risk_counts}
        
        # Get total count
        total_count = sum(risk_stats.values())
        
        # Get source distribution
        source_pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {
                "_id": "$source",
                "count": {"$sum": 1}
            }}
        ]
        
        source_counts = await collection.aggregate(source_pipeline).to_list(length=None)
        source_stats = {item["_id"]: item["count"] for item in source_counts}
        
        # Get recent activity (last 7 days)
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_items = await collection.find(
            {"user_id": user_id, "created_at": {"$gte": week_ago}}
        ).sort("created_at", -1).limit(10).to_list(length=10)
        
        recent_activity = []
        for item in recent_items:
            recent_activity.append({
                "id": str(item["_id"]),
                "subject": item["email_subject"],
                "risk_level": item["risk_level"],
                "created_at": item["created_at"].isoformat()
            })
        
        return HistoryStats(
            total_count=total_count,
            high_risk_count=risk_stats.get("high", 0),
            medium_risk_count=risk_stats.get("medium", 0),
            low_risk_count=risk_stats.get("low", 0),
            sources=source_stats,
            recent_activity=recent_activity
        )
        
    except Exception as e:
        logger.error(f"Error fetching history stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/history/{item_id}", response_model=HistoryItemResponse)
async def get_history_item(
    item_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get a specific history item"""
    try:
        collection = _history_collection(db)
        
        # Validate ObjectId
        try:
            obj_id = ObjectId(item_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid item ID")
        
        item = collection.find_one({"_id": obj_id, "user_id": user_id})
        if not item:
            raise HTTPException(status_code=404, detail="History item not found")
        
        item["_id"] = str(item["_id"])
        return HistoryItemResponse(**item)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching history item: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/history/{item_id}")
async def delete_history_item(
    item_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Delete a specific history item"""
    try:
        collection = _history_collection(db)
        
        # Validate ObjectId
        try:
            obj_id = ObjectId(item_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid item ID")
        
        result = collection.delete_one({"_id": obj_id, "user_id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="History item not found")
        
        return {"message": "History item deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting history item: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/history")
async def clear_history(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Clear all history items for a user"""
    try:
        collection = _history_collection(db)
        
        result = collection.delete_many({"user_id": user_id})
        
        return {
            "message": f"Cleared {result.deleted_count} history items",
            "deleted_count": result.deleted_count
        }
        
    except Exception as e:
        logger.error(f"Error clearing history: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
