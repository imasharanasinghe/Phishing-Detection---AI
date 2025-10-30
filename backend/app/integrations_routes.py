from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timedelta
from app.db import get_db
from app.integrations_models import (
    IntegrationCreate, IntegrationResponse, IntegrationUpdate,
    IntegrationStats, ApiUsage, IntegrationHealth,
    IntegrationType, IntegrationStatus
)
from pymongo.database import Database
from bson import ObjectId
import logging
import random

logger = logging.getLogger(__name__)
router = APIRouter()

def _integrations_collection(db: Database):
    return db.integrations

def _api_usage_collection(db: Database):
    return db.api_usage

@router.post("/integrations", response_model=IntegrationResponse)
async def create_integration(
    integration: IntegrationCreate,
    db: Database = Depends(get_db)
):
    """Create a new integration"""
    try:
        collection = _integrations_collection(db)
        
        now = datetime.utcnow()
        integration_dict = integration.dict()
        integration_dict.update({
            "status": IntegrationStatus.CONFIGURING,
            "created_at": now,
            "updated_at": now
        })
        
        result = await collection.insert_one(integration_dict)
        
        created_integration = await collection.find_one({"_id": result.inserted_id})
        if not created_integration:
            raise HTTPException(status_code=500, detail="Failed to create integration")
        
        created_integration["_id"] = str(created_integration["_id"])
        return IntegrationResponse(**created_integration)
        
    except Exception as e:
        logger.error(f"Error creating integration: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/integrations", response_model=List[IntegrationResponse])
async def get_integrations(
    user_id: str,
    type: Optional[IntegrationType] = None,
    status: Optional[IntegrationStatus] = None,
    db: Database = Depends(get_db)
):
    """Get user integrations"""
    try:
        collection = _integrations_collection(db)
        
        filter_query = {"user_id": user_id}
        
        if type:
            filter_query["type"] = type.value
        if status:
            filter_query["status"] = status.value
        
        integrations = await collection.find(filter_query).sort("created_at", -1).to_list(length=None)
        
        for integration in integrations:
            integration["_id"] = str(integration["_id"])
        
        return [IntegrationResponse(**integration) for integration in integrations]
        
    except Exception as e:
        logger.error(f"Error fetching integrations: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/integrations/stats", response_model=IntegrationStats)
async def get_integration_stats(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get integration statistics"""
    try:
        collection = _integrations_collection(db)
        
        # Get status distribution
        status_pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_counts = await collection.aggregate(status_pipeline).to_list(length=None)
        status_stats = {item["_id"]: item["count"] for item in status_counts}
        
        total_integrations = sum(status_stats.values())
        active_integrations = await collection.count_documents({
            "user_id": user_id,
            "is_active": True
        })
        
        # Mock API usage data
        api_calls_today = random.randint(100, 1000)
        data_transferred_mb = round(random.uniform(10.0, 100.0), 2)
        
        return IntegrationStats(
            total_integrations=total_integrations,
            active_integrations=active_integrations,
            healthy_integrations=status_stats.get("connected", 0),
            error_integrations=status_stats.get("error", 0),
            api_calls_today=api_calls_today,
            data_transferred_mb=data_transferred_mb
        )
        
    except Exception as e:
        logger.error(f"Error fetching integration stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/integrations/usage", response_model=List[ApiUsage])
async def get_api_usage(
    user_id: str,
    days: int = Query(default=30, le=90),
    db: Database = Depends(get_db)
):
    """Get API usage statistics"""
    try:
        # Generate mock usage data
        usage_data = []
        now = datetime.utcnow()
        
        for i in range(days):
            date = now - timedelta(days=i)
            usage_data.append(ApiUsage(
                date=date,
                calls=random.randint(50, 200),
                data_mb=round(random.uniform(5.0, 50.0), 2),
                success_rate=round(random.uniform(95.0, 99.9), 1)
            ))
        
        return sorted(usage_data, key=lambda x: x.date)
        
    except Exception as e:
        logger.error(f"Error fetching API usage: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/integrations/health", response_model=List[IntegrationHealth])
async def get_integration_health(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get integration health status"""
    try:
        collection = _integrations_collection(db)
        
        integrations = await collection.find({
            "user_id": user_id,
            "is_active": True
        }).to_list(length=None)
        
        health_data = []
        for integration in integrations:
            # Mock health data
            status = random.choice([IntegrationStatus.CONNECTED, IntegrationStatus.ERROR])
            health_data.append(IntegrationHealth(
                integration_id=str(integration["_id"]),
                provider=integration["provider"],
                status=status,
                last_check=datetime.utcnow() - timedelta(minutes=random.randint(1, 60)),
                response_time_ms=random.randint(100, 2000) if status == IntegrationStatus.CONNECTED else None,
                error_count=random.randint(0, 5) if status == IntegrationStatus.ERROR else 0
            ))
        
        return health_data
        
    except Exception as e:
        logger.error(f"Error fetching integration health: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/integrations/{integration_id}", response_model=IntegrationResponse)
async def update_integration(
    integration_id: str,
    integration_update: IntegrationUpdate,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Update an integration"""
    try:
        collection = _integrations_collection(db)
        
        try:
            obj_id = ObjectId(integration_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid integration ID")
        
        update_data = {k: v for k, v in integration_update.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        result = await collection.update_one(
            {"_id": obj_id, "user_id": user_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Integration not found")
        
        updated_integration = await collection.find_one({"_id": obj_id})
        updated_integration["_id"] = str(updated_integration["_id"])
        
        return IntegrationResponse(**updated_integration)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating integration: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/integrations/{integration_id}")
async def delete_integration(
    integration_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Delete an integration"""
    try:
        collection = _integrations_collection(db)
        
        try:
            obj_id = ObjectId(integration_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid integration ID")
        
        result = await collection.delete_one({"_id": obj_id, "user_id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Integration not found")
        
        return {"message": "Integration deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting integration: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/integrations/{integration_id}/test")
async def test_integration(
    integration_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Test an integration connection"""
    try:
        collection = _integrations_collection(db)
        
        try:
            obj_id = ObjectId(integration_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid integration ID")
        
        integration = await collection.find_one({"_id": obj_id, "user_id": user_id})
        if not integration:
            raise HTTPException(status_code=404, detail="Integration not found")
        
        # Mock test result
        success = random.choice([True, False])
        
        if success:
            await collection.update_one(
                {"_id": obj_id},
                {"$set": {
                    "status": IntegrationStatus.CONNECTED,
                    "last_sync": datetime.utcnow(),
                    "error_message": None,
                    "updated_at": datetime.utcnow()
                }}
            )
            return {"success": True, "message": "Integration test successful"}
        else:
            error_message = "Connection timeout - please check your configuration"
            await collection.update_one(
                {"_id": obj_id},
                {"$set": {
                    "status": IntegrationStatus.ERROR,
                    "error_message": error_message,
                    "updated_at": datetime.utcnow()
                }}
            )
            return {"success": False, "message": error_message}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing integration: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
