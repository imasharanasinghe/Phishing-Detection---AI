from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from typing import List, Optional
from datetime import datetime, timedelta
from app.db import get_db
from app.reports_models import (
    ReportCreate, ReportResponse, ReportUpdate, ReportFilter,
    ReportStats, ReportData, ScheduledReportCreate, ScheduledReportResponse,
    ReportType, ReportFormat, ReportStatus, ReportFrequency, DateRange
)
from pymongo.database import Database
from bson import ObjectId
import logging
import json
import csv
import io
import os
from pathlib import Path

logger = logging.getLogger(__name__)
router = APIRouter()

def _reports_collection(db: Database):
    return db.reports

def _scheduled_reports_collection(db: Database):
    return db.scheduled_reports

@router.post("/reports", response_model=ReportResponse)
async def create_report(
    report: ReportCreate,
    background_tasks: BackgroundTasks,
    db: Database = Depends(get_db)
):
    """Create and generate a new report"""
    try:
        collection = _reports_collection(db)
        
        now = datetime.utcnow()
        report_dict = report.dict()
        report_dict.update({
            "status": ReportStatus.PENDING,
            "created_at": now,
            "updated_at": now
        })
        
        result = await collection.insert_one(report_dict)
        
        # Add background task to generate the report
        background_tasks.add_task(generate_report_task, str(result.inserted_id), db)
        
        created_report = await collection.find_one({"_id": result.inserted_id})
        if not created_report:
            raise HTTPException(status_code=500, detail="Failed to create report")
        
        created_report["_id"] = str(created_report["_id"])
        return ReportResponse(**created_report)
        
    except Exception as e:
        logger.error(f"Error creating report: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/reports", response_model=List[ReportResponse])
async def get_reports(
    user_id: str,
    report_type: Optional[ReportType] = None,
    status: Optional[ReportStatus] = None,
    frequency: Optional[ReportFrequency] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: Database = Depends(get_db)
):
    """Get filtered reports"""
    try:
        collection = _reports_collection(db)
        
        filter_query = {"user_id": user_id}
        
        if report_type:
            filter_query["report_type"] = report_type.value
        if status:
            filter_query["status"] = status.value
        if frequency:
            filter_query["frequency"] = frequency.value
            
        if date_from or date_to:
            date_filter = {}
            if date_from:
                date_filter["$gte"] = date_from
            if date_to:
                date_filter["$lte"] = date_to
            filter_query["created_at"] = date_filter
        
        cursor = collection.find(filter_query).sort("created_at", -1).skip(offset).limit(limit)
        reports = await cursor.to_list(length=limit)
        
        for report in reports:
            report["_id"] = str(report["_id"])
        
        return [ReportResponse(**report) for report in reports]
        
    except Exception as e:
        logger.error(f"Error fetching reports: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/reports/stats", response_model=ReportStats)
async def get_report_stats(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get report statistics"""
    try:
        collection = _reports_collection(db)
        
        # Get status distribution
        status_pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_counts = await collection.aggregate(status_pipeline).to_list(length=None)
        status_stats = {item["_id"]: item["count"] for item in status_counts}
        
        # Get recent reports
        recent_reports = await collection.find(
            {"user_id": user_id}
        ).sort("created_at", -1).limit(5).to_list(length=5)
        
        recent_activity = []
        for report in recent_reports:
            recent_activity.append({
                "id": str(report["_id"]),
                "name": report["name"],
                "type": report["report_type"],
                "status": report["status"],
                "created_at": report["created_at"].isoformat()
            })
        
        # Count scheduled reports
        scheduled_collection = _scheduled_reports_collection(db)
        scheduled_count = await scheduled_collection.count_documents({
            "user_id": user_id,
            "is_active": True
        })
        
        total_reports = sum(status_stats.values())
        
        return ReportStats(
            total_reports=total_reports,
            completed_reports=status_stats.get("completed", 0),
            failed_reports=status_stats.get("failed", 0),
            scheduled_reports=scheduled_count,
            recent_reports=recent_activity
        )
        
    except Exception as e:
        logger.error(f"Error fetching report stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/reports/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get a specific report"""
    try:
        collection = _reports_collection(db)
        
        try:
            obj_id = ObjectId(report_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid report ID")
        
        report = await collection.find_one({"_id": obj_id, "user_id": user_id})
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        report["_id"] = str(report["_id"])
        return ReportResponse(**report)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching report: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/reports/{report_id}/download")
async def download_report(
    report_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Download a completed report file"""
    try:
        collection = _reports_collection(db)
        
        try:
            obj_id = ObjectId(report_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid report ID")
        
        report = await collection.find_one({"_id": obj_id, "user_id": user_id})
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        if report["status"] != ReportStatus.COMPLETED:
            raise HTTPException(status_code=400, detail="Report is not ready for download")
        
        if not report.get("file_path") or not os.path.exists(report["file_path"]):
            raise HTTPException(status_code=404, detail="Report file not found")
        
        filename = f"{report['name']}.{report['format']}"
        return FileResponse(
            path=report["file_path"],
            filename=filename,
            media_type="application/octet-stream"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading report: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/reports/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: str,
    report_update: ReportUpdate,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Update a report"""
    try:
        collection = _reports_collection(db)
        
        try:
            obj_id = ObjectId(report_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid report ID")
        
        update_data = {k: v for k, v in report_update.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        result = await collection.update_one(
            {"_id": obj_id, "user_id": user_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Report not found")
        
        updated_report = await collection.find_one({"_id": obj_id})
        updated_report["_id"] = str(updated_report["_id"])
        
        return ReportResponse(**updated_report)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating report: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/reports/{report_id}")
async def delete_report(
    report_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Delete a report"""
    try:
        collection = _reports_collection(db)
        
        try:
            obj_id = ObjectId(report_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid report ID")
        
        # Get report to delete associated file
        report = await collection.find_one({"_id": obj_id, "user_id": user_id})
        if report and report.get("file_path") and os.path.exists(report["file_path"]):
            try:
                os.remove(report["file_path"])
            except:
                pass  # File deletion failure shouldn't stop the operation
        
        result = await collection.delete_one({"_id": obj_id, "user_id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return {"message": "Report deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting report: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Scheduled Reports endpoints

@router.post("/reports/scheduled", response_model=ScheduledReportResponse)
async def create_scheduled_report(
    scheduled_report: ScheduledReportCreate,
    db: Database = Depends(get_db)
):
    """Create a scheduled report"""
    try:
        collection = _scheduled_reports_collection(db)
        
        now = datetime.utcnow()
        report_dict = scheduled_report.dict()
        report_dict.update({
            "is_active": True,
            "created_at": now,
            "updated_at": now
        })
        
        result = await collection.insert_one(report_dict)
        
        created_report = await collection.find_one({"_id": result.inserted_id})
        if not created_report:
            raise HTTPException(status_code=500, detail="Failed to create scheduled report")
        
        created_report["_id"] = str(created_report["_id"])
        return ScheduledReportResponse(**created_report)
        
    except Exception as e:
        logger.error(f"Error creating scheduled report: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/reports/scheduled", response_model=List[ScheduledReportResponse])
async def get_scheduled_reports(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get all scheduled reports for a user"""
    try:
        collection = _scheduled_reports_collection(db)
        
        reports = await collection.find({"user_id": user_id}).to_list(length=None)
        
        for report in reports:
            report["_id"] = str(report["_id"])
        
        return [ScheduledReportResponse(**report) for report in reports]
        
    except Exception as e:
        logger.error(f"Error fetching scheduled reports: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Background task for report generation
async def generate_report_task(report_id: str, db: Database):
    """Background task to generate report content and file"""
    try:
        collection = _reports_collection(db)
        obj_id = ObjectId(report_id)
        
        # Update status to generating
        await collection.update_one(
            {"_id": obj_id},
            {"$set": {"status": ReportStatus.GENERATING, "updated_at": datetime.utcnow()}}
        )
        
        # Get report details
        report = await collection.find_one({"_id": obj_id})
        if not report:
            return
        
        # Generate report data (mock implementation)
        report_data = await generate_report_data(report, db)
        
        # Create reports directory if it doesn't exist
        reports_dir = Path("reports")
        reports_dir.mkdir(exist_ok=True)
        
        # Generate file based on format
        file_path = reports_dir / f"report_{report_id}.{report['format']}"
        
        if report["format"] == ReportFormat.JSON:
            with open(file_path, 'w') as f:
                json.dump(report_data.dict(), f, indent=2, default=str)
        elif report["format"] == ReportFormat.CSV:
            await generate_csv_report(file_path, report_data)
        else:
            # For PDF and Excel, create a simple text file for now
            with open(file_path, 'w') as f:
                f.write(f"Report: {report_data.title}\n")
                f.write(f"Generated: {report_data.generated_at}\n")
                f.write(f"Date Range: {report_data.date_range}\n\n")
                f.write("Summary:\n")
                for key, value in report_data.summary.items():
                    f.write(f"  {key}: {value}\n")
        
        file_size = os.path.getsize(file_path)
        
        # Update report with completion status
        await collection.update_one(
            {"_id": obj_id},
            {"$set": {
                "status": ReportStatus.COMPLETED,
                "file_path": str(file_path),
                "file_size": file_size,
                "completed_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }}
        )
        
        logger.info(f"Report {report_id} generated successfully")
        
    except Exception as e:
        logger.error(f"Error generating report {report_id}: {e}")
        
        # Update report with error status
        try:
            await collection.update_one(
                {"_id": obj_id},
                {"$set": {
                    "status": ReportStatus.FAILED,
                    "error_message": str(e),
                    "updated_at": datetime.utcnow()
                }}
            )
        except:
            pass

async def generate_report_data(report: dict, db: Database) -> ReportData:
    """Generate report data based on report configuration"""
    
    # Calculate date range
    now = datetime.utcnow()
    if report["date_range"] == DateRange.LAST_7_DAYS:
        date_from = now - timedelta(days=7)
        date_range_text = "Last 7 days"
    elif report["date_range"] == DateRange.LAST_30_DAYS:
        date_from = now - timedelta(days=30)
        date_range_text = "Last 30 days"
    elif report["date_range"] == DateRange.LAST_90_DAYS:
        date_from = now - timedelta(days=90)
        date_range_text = "Last 90 days"
    elif report["date_range"] == DateRange.LAST_YEAR:
        date_from = now - timedelta(days=365)
        date_range_text = "Last year"
    else:
        date_from = report.get("custom_date_from", now - timedelta(days=30))
        date_to = report.get("custom_date_to", now)
        date_range_text = f"{date_from.strftime('%Y-%m-%d')} to {date_to.strftime('%Y-%m-%d')}"
    
    # Mock data generation (in production, this would query actual data)
    summary = {
        "total_emails_analyzed": 1250,
        "threats_detected": 45,
        "high_risk_emails": 12,
        "medium_risk_emails": 23,
        "low_risk_emails": 10,
        "accuracy_rate": "99.2%"
    }
    
    sections = [
        {
            "title": "Executive Summary",
            "content": "During the reporting period, our AI system analyzed 1,250 emails and detected 45 potential threats with a 99.2% accuracy rate."
        },
        {
            "title": "Threat Breakdown",
            "content": "The majority of threats were phishing attempts (60%), followed by malware (25%) and spam (15%)."
        }
    ]
    
    recommendations = [
        "Continue monitoring for phishing campaigns targeting financial institutions",
        "Update security awareness training to include latest attack vectors",
        "Consider implementing additional email authentication protocols"
    ]
    
    return ReportData(
        title=report["name"],
        generated_at=now,
        date_range=date_range_text,
        summary=summary,
        sections=sections,
        recommendations=recommendations
    )

async def generate_csv_report(file_path: Path, report_data: ReportData):
    """Generate CSV format report"""
    with open(file_path, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile)
        
        # Write header
        writer.writerow(['Metric', 'Value'])
        
        # Write summary data
        for key, value in report_data.summary.items():
            writer.writerow([key.replace('_', ' ').title(), value])
