from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timedelta, date
from decimal import Decimal
from app.db import get_db
from app.billing_models import (
    SubscriptionCreate, SubscriptionResponse, SubscriptionUpdate,
    PaymentMethodCreate, PaymentMethodResponse, InvoiceResponse,
    UsageAnalytics, UsageMetric, PlanDetails, BillingSettings,
    BillingSettingsResponse, CouponResponse, BillingStats,
    PlanChangeRequest, PlanChangePreview, InvoiceLineItem,
    PlanType, BillingCycle, SubscriptionStatus, PaymentStatus,
    PaymentMethodType, InvoiceStatus, DEFAULT_PLANS
)
from pymongo.database import Database
from bson import ObjectId
import logging
import random
import string
from calendar import monthrange

logger = logging.getLogger(__name__)
router = APIRouter()

def _subscriptions_collection(db: Database):
    return db.subscriptions

def _payment_methods_collection(db: Database):
    return db.payment_methods

def _invoices_collection(db: Database):
    return db.invoices

def _billing_settings_collection(db: Database):
    return db.billing_settings

def _usage_collection(db: Database):
    return db.usage_tracking

# Subscription Management
@router.post("/billing/subscriptions", response_model=SubscriptionResponse)
async def create_subscription(
    subscription: SubscriptionCreate,
    db: Database = Depends(get_db)
):
    """Create a new subscription"""
    try:
        collection = _subscriptions_collection(db)
        
        # Check if user already has an active subscription
        existing = await collection.find_one({
            "user_id": subscription.user_id,
            "status": {"$in": [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]}
        })
        
        if existing:
            raise HTTPException(status_code=400, detail="User already has an active subscription")
        
        # Get plan details
        plan_details = DEFAULT_PLANS[subscription.plan_type]
        
        now = datetime.utcnow()
        
        # Calculate billing periods
        if subscription.billing_cycle == BillingCycle.MONTHLY:
            period_end = now + timedelta(days=30)
            price = plan_details.monthly_price
        else:
            period_end = now + timedelta(days=365)
            price = plan_details.annual_price
        
        # Start with trial for paid plans
        trial_end = None
        status = SubscriptionStatus.ACTIVE
        if subscription.plan_type != PlanType.FREE:
            trial_end = now + timedelta(days=14)
            status = SubscriptionStatus.TRIALING
        
        subscription_dict = {
            "user_id": subscription.user_id,
            "plan_type": subscription.plan_type.value,
            "billing_cycle": subscription.billing_cycle.value,
            "status": status.value,
            "current_period_start": now,
            "current_period_end": period_end,
            "trial_end": trial_end,
            "cancel_at_period_end": False,
            "created_at": now,
            "updated_at": now,
            "plan_name": plan_details.name,
            "plan_price": float(price),
            "plan_features": {feature.name: feature.dict() for feature in plan_details.features},
            "usage_limits": plan_details.limits,
            "current_usage": {key: 0 for key in plan_details.limits.keys()}
        }
        
        result = await collection.insert_one(subscription_dict)
        
        # Create first invoice for paid plans
        if subscription.plan_type != PlanType.FREE:
            await create_subscription_invoice(db, str(result.inserted_id), subscription_dict)
        
        created_subscription = await collection.find_one({"_id": result.inserted_id})
        if not created_subscription:
            raise HTTPException(status_code=500, detail="Failed to create subscription")
        
        created_subscription["_id"] = str(created_subscription["_id"])
        return SubscriptionResponse(**created_subscription)
        
    except Exception as e:
        logger.error(f"Error creating subscription: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/billing/subscriptions/{user_id}", response_model=SubscriptionResponse)
async def get_user_subscription(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get user's current subscription"""
    try:
        collection = _subscriptions_collection(db)
        
        subscription = await collection.find_one({
            "user_id": user_id,
            "status": {"$in": [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE]}
        })
        
        if not subscription:
            # Return default free subscription
            plan_details = DEFAULT_PLANS[PlanType.FREE]
            now = datetime.utcnow()
            
            free_subscription = {
                "_id": "free_" + user_id,
                "user_id": user_id,
                "plan_type": PlanType.FREE.value,
                "billing_cycle": BillingCycle.MONTHLY.value,
                "status": SubscriptionStatus.ACTIVE.value,
                "current_period_start": now,
                "current_period_end": now + timedelta(days=30),
                "trial_end": None,
                "cancel_at_period_end": False,
                "created_at": now,
                "updated_at": now,
                "plan_name": plan_details.name,
                "plan_price": float(plan_details.monthly_price),
                "plan_features": {feature.name: feature.dict() for feature in plan_details.features},
                "usage_limits": plan_details.limits,
                "current_usage": {key: 0 for key in plan_details.limits.keys()}
            }
            
            return SubscriptionResponse(**free_subscription)
        
        subscription["_id"] = str(subscription["_id"])
        return SubscriptionResponse(**subscription)
        
    except Exception as e:
        logger.error(f"Error fetching subscription: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/billing/subscriptions/{subscription_id}", response_model=SubscriptionResponse)
async def update_subscription(
    subscription_id: str,
    subscription_update: SubscriptionUpdate,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Update a subscription"""
    try:
        collection = _subscriptions_collection(db)
        
        try:
            obj_id = ObjectId(subscription_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid subscription ID")
        
        update_data = {k: v for k, v in subscription_update.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        # Handle plan changes
        if "plan_type" in update_data:
            plan_details = DEFAULT_PLANS[update_data["plan_type"]]
            update_data.update({
                "plan_name": plan_details.name,
                "plan_price": float(plan_details.monthly_price if update_data.get("billing_cycle", "monthly") == "monthly" else plan_details.annual_price),
                "plan_features": {feature.name: feature.dict() for feature in plan_details.features},
                "usage_limits": plan_details.limits
            })
        
        result = await collection.update_one(
            {"_id": obj_id, "user_id": user_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        updated_subscription = await collection.find_one({"_id": obj_id})
        updated_subscription["_id"] = str(updated_subscription["_id"])
        
        return SubscriptionResponse(**updated_subscription)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating subscription: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/billing/subscriptions/{subscription_id}/cancel")
async def cancel_subscription(
    subscription_id: str,
    user_id: str,
    at_period_end: bool = True,
    db: Database = Depends(get_db)
):
    """Cancel a subscription"""
    try:
        collection = _subscriptions_collection(db)
        
        try:
            obj_id = ObjectId(subscription_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid subscription ID")
        
        update_data = {
            "cancel_at_period_end": at_period_end,
            "updated_at": datetime.utcnow()
        }
        
        if not at_period_end:
            update_data.update({
                "status": SubscriptionStatus.CANCELLED.value,
                "cancelled_at": datetime.utcnow()
            })
        
        result = await collection.update_one(
            {"_id": obj_id, "user_id": user_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        return {"message": "Subscription cancelled successfully", "at_period_end": at_period_end}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling subscription: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Payment Methods
@router.post("/billing/payment-methods", response_model=PaymentMethodResponse)
async def create_payment_method(
    payment_method: PaymentMethodCreate,
    db: Database = Depends(get_db)
):
    """Add a new payment method"""
    try:
        collection = _payment_methods_collection(db)
        
        # If this is set as default, unset other defaults
        if payment_method.is_default:
            await collection.update_many(
                {"user_id": payment_method.user_id},
                {"$set": {"is_default": False}}
            )
        
        now = datetime.utcnow()
        
        # Simulate card validation and tokenization
        payment_method_dict = {
            "user_id": payment_method.user_id,
            "type": payment_method.type.value,
            "card_last4": payment_method.card_number[-4:] if payment_method.card_number else None,
            "card_brand": payment_method.card_brand,
            "card_exp_month": payment_method.card_exp_month,
            "card_exp_year": payment_method.card_exp_year,
            "cardholder_name": payment_method.cardholder_name,
            "billing_address": payment_method.billing_address,
            "is_default": payment_method.is_default,
            "is_expired": False,
            "created_at": now,
            "updated_at": now
        }
        
        # Check if card is expired
        if payment_method.card_exp_month and payment_method.card_exp_year:
            current_date = datetime.now()
            if (payment_method.card_exp_year < current_date.year or 
                (payment_method.card_exp_year == current_date.year and payment_method.card_exp_month < current_date.month)):
                payment_method_dict["is_expired"] = True
        
        result = await collection.insert_one(payment_method_dict)
        
        created_payment_method = await collection.find_one({"_id": result.inserted_id})
        if not created_payment_method:
            raise HTTPException(status_code=500, detail="Failed to create payment method")
        
        created_payment_method["_id"] = str(created_payment_method["_id"])
        return PaymentMethodResponse(**created_payment_method)
        
    except Exception as e:
        logger.error(f"Error creating payment method: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/billing/payment-methods", response_model=List[PaymentMethodResponse])
async def get_payment_methods(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get user's payment methods"""
    try:
        collection = _payment_methods_collection(db)
        
        payment_methods = await collection.find({"user_id": user_id}).sort("created_at", -1).to_list(length=None)
        
        for pm in payment_methods:
            pm["_id"] = str(pm["_id"])
        
        return [PaymentMethodResponse(**pm) for pm in payment_methods]
        
    except Exception as e:
        logger.error(f"Error fetching payment methods: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/billing/payment-methods/{payment_method_id}")
async def delete_payment_method(
    payment_method_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Delete a payment method"""
    try:
        collection = _payment_methods_collection(db)
        
        try:
            obj_id = ObjectId(payment_method_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid payment method ID")
        
        result = await collection.delete_one({"_id": obj_id, "user_id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Payment method not found")
        
        return {"message": "Payment method deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting payment method: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Invoices
@router.get("/billing/invoices", response_model=List[InvoiceResponse])
async def get_invoices(
    user_id: str,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: Database = Depends(get_db)
):
    """Get user's invoices"""
    try:
        collection = _invoices_collection(db)
        
        invoices = await collection.find({"user_id": user_id}).sort("invoice_date", -1).skip(offset).limit(limit).to_list(length=limit)
        
        for invoice in invoices:
            invoice["_id"] = str(invoice["_id"])
        
        return [InvoiceResponse(**invoice) for invoice in invoices]
        
    except Exception as e:
        logger.error(f"Error fetching invoices: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/billing/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get a specific invoice"""
    try:
        collection = _invoices_collection(db)
        
        try:
            obj_id = ObjectId(invoice_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid invoice ID")
        
        invoice = await collection.find_one({"_id": obj_id, "user_id": user_id})
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice["_id"] = str(invoice["_id"])
        return InvoiceResponse(**invoice)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Usage Analytics
@router.get("/billing/usage/{user_id}", response_model=UsageAnalytics)
async def get_usage_analytics(
    user_id: str,
    period: str = Query(default="current", regex="^(current|last_30_days|last_90_days)$"),
    db: Database = Depends(get_db)
):
    """Get usage analytics for billing period"""
    try:
        # Get user's subscription to determine limits
        subscription = await get_user_subscription(user_id, db)
        
        # Calculate period dates
        now = datetime.utcnow()
        if period == "current":
            period_start = subscription.current_period_start
            period_end = subscription.current_period_end
        elif period == "last_30_days":
            period_start = now - timedelta(days=30)
            period_end = now
        else:  # last_90_days
            period_start = now - timedelta(days=90)
            period_end = now
        
        # Generate mock usage data based on subscription limits
        metrics = []
        for metric_name, limit in subscription.usage_limits.items():
            if limit == -1:  # unlimited
                current_value = random.randint(1000, 10000)
                percentage_used = 0.0
                limit_value = -1
            else:
                current_value = random.randint(0, min(limit, int(limit * 1.2)))  # Can go over limit
                percentage_used = (current_value / limit * 100) if limit > 0 else 0.0
                limit_value = limit
            
            metrics.append(UsageMetric(
                metric_name=metric_name.replace('_', ' ').title(),
                current_value=current_value,
                limit_value=limit_value,
                percentage_used=round(percentage_used, 1),
                period_start=period_start,
                period_end=period_end
            ))
        
        # Calculate overage charges (mock)
        overage_charges = Decimal('0.00')
        for metric in metrics:
            if metric.limit_value > 0 and metric.current_value > metric.limit_value:
                overage = metric.current_value - metric.limit_value
                overage_charges += Decimal(str(overage * 0.01))  # $0.01 per unit over
        
        # Generate projected usage
        projected_usage = {}
        days_in_period = (period_end - period_start).days
        days_elapsed = (now - period_start).days
        
        if days_elapsed > 0:
            for metric in metrics:
                daily_rate = metric.current_value / days_elapsed
                projected_total = int(daily_rate * days_in_period)
                projected_usage[metric.metric_name.lower().replace(' ', '_')] = projected_total
        
        return UsageAnalytics(
            subscription_id=subscription.id,
            billing_period_start=period_start,
            billing_period_end=period_end,
            metrics=metrics,
            overage_charges=overage_charges,
            projected_usage=projected_usage
        )
        
    except Exception as e:
        logger.error(f"Error fetching usage analytics: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Plan Management
@router.get("/billing/plans", response_model=List[PlanDetails])
async def get_available_plans():
    """Get all available plans"""
    return list(DEFAULT_PLANS.values())

@router.post("/billing/plans/preview-change", response_model=PlanChangePreview)
async def preview_plan_change(
    plan_change: PlanChangeRequest,
    user_id: str,
    db: Database = Depends(get_db)
):
    """Preview a plan change with proration calculation"""
    try:
        # Get current subscription
        current_subscription = await get_user_subscription(user_id, db)
        current_plan = DEFAULT_PLANS[PlanType(current_subscription.plan_type)]
        new_plan = DEFAULT_PLANS[plan_change.new_plan_type]
        
        # Calculate proration
        now = datetime.utcnow()
        effective_date = plan_change.effective_date or now
        
        # Days remaining in current period
        days_remaining = (current_subscription.current_period_end - effective_date).days
        total_days = (current_subscription.current_period_end - current_subscription.current_period_start).days
        
        # Current plan refund (prorated)
        current_price = Decimal(str(current_subscription.plan_price))
        refund_amount = (current_price * days_remaining) / total_days if total_days > 0 else Decimal('0')
        
        # New plan charge (prorated)
        new_billing_cycle = plan_change.new_billing_cycle or BillingCycle(current_subscription.billing_cycle)
        new_price = new_plan.monthly_price if new_billing_cycle == BillingCycle.MONTHLY else new_plan.annual_price
        charge_amount = (new_price * days_remaining) / total_days if total_days > 0 else new_price
        
        proration_amount = charge_amount - refund_amount if plan_change.prorate else new_price
        
        # Next invoice amount (full new plan price)
        next_invoice_amount = new_plan.monthly_price if new_billing_cycle == BillingCycle.MONTHLY else new_plan.annual_price
        
        return PlanChangePreview(
            current_plan=current_plan,
            new_plan=new_plan,
            proration_amount=proration_amount,
            next_invoice_amount=next_invoice_amount,
            effective_date=effective_date,
            billing_cycle_change=new_billing_cycle.value != current_subscription.billing_cycle
        )
        
    except Exception as e:
        logger.error(f"Error previewing plan change: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Billing Settings
@router.get("/billing/settings/{user_id}", response_model=BillingSettingsResponse)
async def get_billing_settings(
    user_id: str,
    db: Database = Depends(get_db)
):
    """Get user's billing settings"""
    try:
        collection = _billing_settings_collection(db)
        
        settings = await collection.find_one({"user_id": user_id})
        if not settings:
            # Return default settings
            now = datetime.utcnow()
            default_settings = {
                "_id": f"settings_{user_id}",
                "user_id": user_id,
                "billing_email": f"user{user_id}@example.com",
                "company_name": None,
                "tax_id": None,
                "billing_address": {
                    "line1": "",
                    "line2": "",
                    "city": "",
                    "state": "",
                    "postal_code": "",
                    "country": "US"
                },
                "auto_pay_enabled": True,
                "invoice_delivery": "email",
                "currency": "USD",
                "timezone": "UTC",
                "created_at": now,
                "updated_at": now
            }
            return BillingSettingsResponse(**default_settings)
        
        settings["_id"] = str(settings["_id"])
        return BillingSettingsResponse(**settings)
        
    except Exception as e:
        logger.error(f"Error fetching billing settings: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/billing/settings/{user_id}", response_model=BillingSettingsResponse)
async def update_billing_settings(
    user_id: str,
    settings: BillingSettings,
    db: Database = Depends(get_db)
):
    """Update user's billing settings"""
    try:
        collection = _billing_settings_collection(db)
        
        settings_dict = settings.dict()
        settings_dict["updated_at"] = datetime.utcnow()
        
        result = await collection.update_one(
            {"user_id": user_id},
            {"$set": settings_dict, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True
        )
        
        updated_settings = await collection.find_one({"user_id": user_id})
        updated_settings["_id"] = str(updated_settings["_id"])
        
        return BillingSettingsResponse(**updated_settings)
        
    except Exception as e:
        logger.error(f"Error updating billing settings: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Statistics
@router.get("/billing/stats", response_model=BillingStats)
async def get_billing_stats(
    organization_id: str,  # In a real app, this would be derived from auth
    db: Database = Depends(get_db)
):
    """Get billing statistics (admin only)"""
    try:
        subscriptions_collection = _subscriptions_collection(db)
        
        # Get plan distribution
        plan_pipeline = [
            {"$group": {"_id": "$plan_type", "count": {"$sum": 1}}}
        ]
        plan_counts = await subscriptions_collection.aggregate(plan_pipeline).to_list(length=None)
        plan_distribution = {item["_id"]: item["count"] for item in plan_counts}
        
        # Mock statistics
        total_subscriptions = sum(plan_distribution.values())
        
        return BillingStats(
            total_revenue=Decimal(str(random.randint(10000, 100000))),
            monthly_recurring_revenue=Decimal(str(random.randint(5000, 20000))),
            annual_recurring_revenue=Decimal(str(random.randint(60000, 240000))),
            active_subscriptions=total_subscriptions,
            cancelled_subscriptions=random.randint(0, int(total_subscriptions * 0.1)),
            trial_subscriptions=random.randint(0, int(total_subscriptions * 0.2)),
            churn_rate=round(random.uniform(2.0, 8.0), 1),
            average_revenue_per_user=Decimal(str(random.randint(20, 80))),
            recent_payments=[
                {
                    "id": f"pay_{i}",
                    "amount": random.randint(20, 80),
                    "status": "succeeded",
                    "created_at": (datetime.utcnow() - timedelta(days=random.randint(0, 30))).isoformat()
                }
                for i in range(10)
            ],
            plan_distribution=plan_distribution
        )
        
    except Exception as e:
        logger.error(f"Error fetching billing stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Helper Functions
async def create_subscription_invoice(db: Database, subscription_id: str, subscription_data: dict):
    """Create an invoice for a subscription"""
    try:
        collection = _invoices_collection(db)
        
        now = datetime.utcnow()
        invoice_number = f"INV-{now.strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
        
        # Create line item
        line_item = InvoiceLineItem(
            description=f"{subscription_data['plan_name']} Plan - {subscription_data['billing_cycle'].title()}",
            quantity=1,
            unit_price=Decimal(str(subscription_data['plan_price'])),
            total=Decimal(str(subscription_data['plan_price'])),
            period_start=subscription_data['current_period_start'],
            period_end=subscription_data['current_period_end']
        )
        
        subtotal = line_item.total
        tax_amount = subtotal * Decimal('0.08')  # 8% tax
        total = subtotal + tax_amount
        
        invoice_dict = {
            "user_id": subscription_data['user_id'],
            "subscription_id": subscription_id,
            "invoice_number": invoice_number,
            "status": InvoiceStatus.OPEN.value,
            "subtotal": float(subtotal),
            "tax_amount": float(tax_amount),
            "discount_amount": 0.0,
            "total": float(total),
            "currency": "USD",
            "invoice_date": now.date(),
            "due_date": (now + timedelta(days=30)).date(),
            "line_items": [line_item.dict()],
            "payment_status": PaymentStatus.PENDING.value,
            "created_at": now,
            "updated_at": now
        }
        
        await collection.insert_one(invoice_dict)
        
    except Exception as e:
        logger.error(f"Error creating invoice: {e}")

def generate_coupon_code() -> str:
    """Generate a random coupon code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
