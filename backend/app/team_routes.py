from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timedelta
from app.db import get_db
from app.team_models import (
    TeamMemberCreate, TeamMemberResponse, TeamMemberUpdate, TeamFilter,
    InvitationCreate, InvitationResponse, TeamStats, ActivityLog,
    RolePermissions, DEFAULT_ROLE_PERMISSIONS,
    UserRole, UserStatus, InvitationStatus, Permission
)
from pymongo.database import Database
from bson import ObjectId
import logging
import secrets
import string

logger = logging.getLogger(__name__)
router = APIRouter()

def _team_members_collection(db: Database):
    return db.team_members

def _invitations_collection(db: Database):
    return db.invitations

def _activity_logs_collection(db: Database):
    return db.activity_logs

@router.post("/team/members", response_model=TeamMemberResponse)
async def create_team_member(
    member: TeamMemberCreate,
    current_user_id: str,
    db: Database = Depends(get_db)
):
    """Create a new team member (internal use, typically after invitation acceptance)"""
    try:
        collection = _team_members_collection(db)
        
        # Check if member already exists
        existing = await collection.find_one({"email": member.email})
        if existing:
            raise HTTPException(status_code=400, detail="Member with this email already exists")
        
        now = datetime.utcnow()
        member_dict = member.dict()
        member_dict.update({
            "status": UserStatus.ACTIVE,
            "created_at": now,
            "updated_at": now,
            "created_by": current_user_id
        })
        
        # Set default permissions if not provided
        if not member_dict["permissions"]:
            member_dict["permissions"] = [p.value for p in DEFAULT_ROLE_PERMISSIONS.get(member.role, [])]
        
        result = await collection.insert_one(member_dict)
        
        # Log activity
        await log_activity(
            db, current_user_id, "create_member", "member", str(result.inserted_id),
            {"email": member.email, "role": member.role.value}
        )
        
        created_member = await collection.find_one({"_id": result.inserted_id})
        if not created_member:
            raise HTTPException(status_code=500, detail="Failed to create team member")
        
        created_member["_id"] = str(created_member["_id"])
        return TeamMemberResponse(**created_member)
        
    except Exception as e:
        logger.error(f"Error creating team member: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/team/members", response_model=List[TeamMemberResponse])
async def get_team_members(
    organization_id: str,  # In a real app, this would come from auth context
    role: Optional[UserRole] = None,
    status: Optional[UserStatus] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: Database = Depends(get_db)
):
    """Get filtered team members"""
    try:
        collection = _team_members_collection(db)
        
        # In a real app, filter by organization_id
        filter_query = {}
        
        if role:
            filter_query["role"] = role.value
        if status:
            filter_query["status"] = status.value
        if department:
            filter_query["department"] = {"$regex": department, "$options": "i"}
            
        if search:
            filter_query["$or"] = [
                {"first_name": {"$regex": search, "$options": "i"}},
                {"last_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"job_title": {"$regex": search, "$options": "i"}}
            ]
        
        cursor = collection.find(filter_query).sort("created_at", -1).skip(offset).limit(limit)
        members = await cursor.to_list(length=limit)
        
        for member in members:
            member["_id"] = str(member["_id"])
        
        return [TeamMemberResponse(**member) for member in members]
        
    except Exception as e:
        logger.error(f"Error fetching team members: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/team/stats", response_model=TeamStats)
async def get_team_stats(
    organization_id: str,
    db: Database = Depends(get_db)
):
    """Get team statistics"""
    try:
        members_collection = _team_members_collection(db)
        invitations_collection = _invitations_collection(db)
        
        # Get role distribution
        role_pipeline = [
            {"$group": {"_id": "$role", "count": {"$sum": 1}}}
        ]
        role_counts = await members_collection.aggregate(role_pipeline).to_list(length=None)
        role_stats = {item["_id"]: item["count"] for item in role_counts}
        
        # Get status counts
        total_members = await members_collection.count_documents({})
        active_members = await members_collection.count_documents({"status": UserStatus.ACTIVE})
        pending_invitations = await invitations_collection.count_documents({"status": InvitationStatus.PENDING})
        
        # Get recent activity
        activity_collection = _activity_logs_collection(db)
        recent_activity = await activity_collection.find({}).sort("timestamp", -1).limit(10).to_list(length=10)
        
        activity_list = []
        for activity in recent_activity:
            activity_list.append({
                "id": str(activity["_id"]),
                "action": activity["action"],
                "details": activity["details"],
                "timestamp": activity["timestamp"].isoformat()
            })
        
        return TeamStats(
            total_members=total_members,
            active_members=active_members,
            pending_invitations=pending_invitations,
            role_distribution=role_stats,
            recent_activity=activity_list
        )
        
    except Exception as e:
        logger.error(f"Error fetching team stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/team/members/{member_id}", response_model=TeamMemberResponse)
async def update_team_member(
    member_id: str,
    member_update: TeamMemberUpdate,
    current_user_id: str,
    db: Database = Depends(get_db)
):
    """Update a team member"""
    try:
        collection = _team_members_collection(db)
        
        try:
            obj_id = ObjectId(member_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid member ID")
        
        update_data = {k: v for k, v in member_update.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        # If role is being updated, update permissions too
        if "role" in update_data:
            update_data["permissions"] = [p.value for p in DEFAULT_ROLE_PERMISSIONS.get(update_data["role"], [])]
        
        result = await collection.update_one(
            {"_id": obj_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Team member not found")
        
        # Log activity
        await log_activity(
            db, current_user_id, "update_member", "member", member_id,
            {"changes": update_data}
        )
        
        updated_member = await collection.find_one({"_id": obj_id})
        updated_member["_id"] = str(updated_member["_id"])
        
        return TeamMemberResponse(**updated_member)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating team member: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/team/members/{member_id}")
async def remove_team_member(
    member_id: str,
    current_user_id: str,
    db: Database = Depends(get_db)
):
    """Remove a team member"""
    try:
        collection = _team_members_collection(db)
        
        try:
            obj_id = ObjectId(member_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid member ID")
        
        # Get member info for logging
        member = await collection.find_one({"_id": obj_id})
        if not member:
            raise HTTPException(status_code=404, detail="Team member not found")
        
        result = await collection.delete_one({"_id": obj_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Team member not found")
        
        # Log activity
        await log_activity(
            db, current_user_id, "remove_member", "member", member_id,
            {"email": member["email"], "role": member["role"]}
        )
        
        return {"message": "Team member removed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing team member: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Invitation endpoints

@router.post("/team/invitations", response_model=InvitationResponse)
async def create_invitation(
    invitation: InvitationCreate,
    current_user_id: str,
    db: Database = Depends(get_db)
):
    """Send an invitation to join the team"""
    try:
        collection = _invitations_collection(db)
        members_collection = _team_members_collection(db)
        
        # Check if user is already a member
        existing_member = await members_collection.find_one({"email": invitation.email})
        if existing_member:
            raise HTTPException(status_code=400, detail="User is already a team member")
        
        # Check for existing pending invitation
        existing_invitation = await collection.find_one({
            "email": invitation.email,
            "status": InvitationStatus.PENDING
        })
        if existing_invitation:
            raise HTTPException(status_code=400, detail="Pending invitation already exists for this email")
        
        # Generate invitation token
        token = generate_invitation_token()
        
        now = datetime.utcnow()
        expires_at = invitation.expires_at or (now + timedelta(days=7))
        
        invitation_dict = invitation.dict()
        invitation_dict.update({
            "status": InvitationStatus.PENDING,
            "token": token,
            "expires_at": expires_at,
            "created_at": now,
            "created_by": current_user_id
        })
        
        # Set default permissions if not provided
        if not invitation_dict["permissions"]:
            invitation_dict["permissions"] = [p.value for p in DEFAULT_ROLE_PERMISSIONS.get(invitation.role, [])]
        
        result = await collection.insert_one(invitation_dict)
        
        # Log activity
        await log_activity(
            db, current_user_id, "send_invitation", "invitation", str(result.inserted_id),
            {"email": invitation.email, "role": invitation.role.value}
        )
        
        # In a real app, send email invitation here
        logger.info(f"Invitation sent to {invitation.email} with token {token}")
        
        created_invitation = await collection.find_one({"_id": result.inserted_id})
        if not created_invitation:
            raise HTTPException(status_code=500, detail="Failed to create invitation")
        
        created_invitation["_id"] = str(created_invitation["_id"])
        return InvitationResponse(**created_invitation)
        
    except Exception as e:
        logger.error(f"Error creating invitation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/team/invitations", response_model=List[InvitationResponse])
async def get_invitations(
    organization_id: str,
    status: Optional[InvitationStatus] = None,
    db: Database = Depends(get_db)
):
    """Get team invitations"""
    try:
        collection = _invitations_collection(db)
        
        filter_query = {}
        if status:
            filter_query["status"] = status.value
        
        invitations = await collection.find(filter_query).sort("created_at", -1).to_list(length=None)
        
        for invitation in invitations:
            invitation["_id"] = str(invitation["_id"])
        
        return [InvitationResponse(**invitation) for invitation in invitations]
        
    except Exception as e:
        logger.error(f"Error fetching invitations: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/team/invitations/{invitation_id}/cancel")
async def cancel_invitation(
    invitation_id: str,
    current_user_id: str,
    db: Database = Depends(get_db)
):
    """Cancel a pending invitation"""
    try:
        collection = _invitations_collection(db)
        
        try:
            obj_id = ObjectId(invitation_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid invitation ID")
        
        result = await collection.update_one(
            {"_id": obj_id, "status": InvitationStatus.PENDING},
            {"$set": {"status": InvitationStatus.CANCELLED, "updated_at": datetime.utcnow()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Pending invitation not found")
        
        # Log activity
        await log_activity(
            db, current_user_id, "cancel_invitation", "invitation", invitation_id, {}
        )
        
        return {"message": "Invitation cancelled successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling invitation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/team/roles", response_model=List[RolePermissions])
async def get_role_permissions():
    """Get available roles and their permissions"""
    roles = []
    
    role_descriptions = {
        UserRole.ADMIN: "Full access to all features and settings",
        UserRole.AGENT: "Can analyze emails, manage threats, and generate reports",
        UserRole.CLIENT: "Can analyze emails and view reports",
        UserRole.VIEWER: "Read-only access to dashboard and history"
    }
    
    for role, permissions in DEFAULT_ROLE_PERMISSIONS.items():
        roles.append(RolePermissions(
            role=role,
            permissions=permissions,
            description=role_descriptions.get(role, "")
        ))
    
    return roles

# Helper functions

def generate_invitation_token() -> str:
    """Generate a secure invitation token"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))

async def log_activity(
    db: Database,
    user_id: str,
    action: str,
    target_type: str,
    target_id: str,
    details: dict,
    ip_address: Optional[str] = None
):
    """Log team activity"""
    try:
        collection = _activity_logs_collection(db)
        
        activity = {
            "user_id": user_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details,
            "timestamp": datetime.utcnow(),
            "ip_address": ip_address
        }
        
        await collection.insert_one(activity)
        
    except Exception as e:
        logger.error(f"Error logging activity: {e}")
        # Don't raise exception for logging failures
