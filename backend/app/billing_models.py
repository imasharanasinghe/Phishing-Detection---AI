from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, date
from enum import Enum
from decimal import Decimal

class PlanType(str, Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"

class BillingCycle(str, Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"

class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    CANCELLED = "cancelled"
    PAST_DUE = "past_due"
    UNPAID = "unpaid"
    TRIALING = "trialing"
    INCOMPLETE = "incomplete"

class PaymentStatus(str, Enum):
    SUCCEEDED = "succeeded"
    PENDING = "pending"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"

class PaymentMethodType(str, Enum):
    CARD = "card"
    BANK_ACCOUNT = "bank_account"
    PAYPAL = "paypal"

class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    OPEN = "open"
    PAID = "paid"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"

# Subscription Models
class SubscriptionCreate(BaseModel):
    user_id: str
    plan_type: PlanType
    billing_cycle: BillingCycle
    payment_method_id: str
    coupon_code: Optional[str] = None

class SubscriptionResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    plan_type: PlanType
    billing_cycle: BillingCycle
    status: SubscriptionStatus
    current_period_start: datetime
    current_period_end: datetime
    trial_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    # Plan details
    plan_name: str
    plan_price: Decimal
    plan_features: Dict[str, Any]
    
    # Usage tracking
    usage_limits: Dict[str, int]
    current_usage: Dict[str, int]

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            Decimal: lambda v: float(v)
        }

class SubscriptionUpdate(BaseModel):
    plan_type: Optional[PlanType] = None
    billing_cycle: Optional[BillingCycle] = None
    payment_method_id: Optional[str] = None
    cancel_at_period_end: Optional[bool] = None

# Payment Method Models
class PaymentMethodCreate(BaseModel):
    user_id: str
    type: PaymentMethodType
    card_number: Optional[str] = None  # Last 4 digits only
    card_brand: Optional[str] = None  # visa, mastercard, etc.
    card_exp_month: Optional[int] = None
    card_exp_year: Optional[int] = None
    cardholder_name: Optional[str] = None
    billing_address: Optional[Dict[str, str]] = None
    is_default: bool = False

class PaymentMethodResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    type: PaymentMethodType
    card_last4: Optional[str] = None
    card_brand: Optional[str] = None
    card_exp_month: Optional[int] = None
    card_exp_year: Optional[int] = None
    cardholder_name: Optional[str] = None
    billing_address: Optional[Dict[str, str]] = None
    is_default: bool
    is_expired: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# Invoice Models
class InvoiceLineItem(BaseModel):
    description: str
    quantity: int
    unit_price: Decimal
    total: Decimal
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None

class InvoiceResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    subscription_id: Optional[str] = None
    invoice_number: str
    status: InvoiceStatus
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total: Decimal
    currency: str = "USD"
    
    # Dates
    invoice_date: date
    due_date: date
    paid_at: Optional[datetime] = None
    
    # Line items
    line_items: List[InvoiceLineItem]
    
    # Payment info
    payment_method_id: Optional[str] = None
    payment_status: Optional[PaymentStatus] = None
    
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat(),
            Decimal: lambda v: float(v)
        }

# Usage Analytics Models
class UsageMetric(BaseModel):
    metric_name: str
    current_value: int
    limit_value: int
    percentage_used: float
    period_start: datetime
    period_end: datetime

class UsageAnalytics(BaseModel):
    subscription_id: str
    billing_period_start: datetime
    billing_period_end: datetime
    metrics: List[UsageMetric]
    overage_charges: Decimal = Decimal('0.00')
    projected_usage: Dict[str, int] = {}

# Plan Comparison Models
class PlanFeature(BaseModel):
    name: str
    description: str
    included: bool
    limit: Optional[int] = None
    unlimited: bool = False

class PlanDetails(BaseModel):
    type: PlanType
    name: str
    description: str
    monthly_price: Decimal
    annual_price: Decimal
    annual_discount_percent: int
    features: List[PlanFeature]
    limits: Dict[str, int]
    popular: bool = False

# Billing Settings Models
class BillingSettings(BaseModel):
    user_id: str
    billing_email: EmailStr
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    billing_address: Dict[str, str]
    auto_pay_enabled: bool = True
    invoice_delivery: str = "email"  # email, postal
    currency: str = "USD"
    timezone: str = "UTC"

class BillingSettingsResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    billing_email: str
    company_name: Optional[str]
    tax_id: Optional[str]
    billing_address: Dict[str, str]
    auto_pay_enabled: bool
    invoice_delivery: str
    currency: str
    timezone: str
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# Coupon Models
class CouponResponse(BaseModel):
    id: str
    code: str
    name: str
    description: str
    discount_type: str  # "percent" or "amount"
    discount_value: Decimal
    valid_from: datetime
    valid_until: datetime
    max_uses: Optional[int] = None
    current_uses: int = 0
    is_active: bool = True

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            Decimal: lambda v: float(v)
        }

# Billing Statistics Models
class BillingStats(BaseModel):
    total_revenue: Decimal
    monthly_recurring_revenue: Decimal
    annual_recurring_revenue: Decimal
    active_subscriptions: int
    cancelled_subscriptions: int
    trial_subscriptions: int
    churn_rate: float
    average_revenue_per_user: Decimal
    recent_payments: List[Dict[str, Any]]
    plan_distribution: Dict[str, int]

    class Config:
        json_encoders = {
            Decimal: lambda v: float(v)
        }

# Plan Change Models
class PlanChangeRequest(BaseModel):
    new_plan_type: PlanType
    new_billing_cycle: Optional[BillingCycle] = None
    prorate: bool = True
    effective_date: Optional[datetime] = None

class PlanChangePreview(BaseModel):
    current_plan: PlanDetails
    new_plan: PlanDetails
    proration_amount: Decimal
    next_invoice_amount: Decimal
    effective_date: datetime
    billing_cycle_change: bool = False

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            Decimal: lambda v: float(v)
        }

# Default plan configurations
DEFAULT_PLANS = {
    PlanType.FREE: PlanDetails(
        type=PlanType.FREE,
        name="Free",
        description="Perfect for getting started",
        monthly_price=Decimal('0.00'),
        annual_price=Decimal('0.00'),
        annual_discount_percent=0,
        features=[
            PlanFeature(name="Email Analysis", description="Basic email scanning", included=True, limit=100),
            PlanFeature(name="Threat Detection", description="Standard threat detection", included=True),
            PlanFeature(name="Basic Reports", description="Monthly summary reports", included=True, limit=1),
            PlanFeature(name="Email Support", description="Standard email support", included=True),
            PlanFeature(name="API Access", description="Limited API calls", included=True, limit=1000),
        ],
        limits={
            "emails_per_month": 100,
            "reports_per_month": 1,
            "api_calls_per_month": 1000,
            "team_members": 1,
            "integrations": 2
        }
    ),
    PlanType.PRO: PlanDetails(
        type=PlanType.PRO,
        name="Pro",
        description="Advanced features for growing teams",
        monthly_price=Decimal('23.00'),
        annual_price=Decimal('230.00'),
        annual_discount_percent=17,
        features=[
            PlanFeature(name="Email Analysis", description="Advanced email scanning", included=True, limit=10000),
            PlanFeature(name="Advanced Threat Detection", description="ML-powered threat detection", included=True),
            PlanFeature(name="Custom Reports", description="Unlimited custom reports", included=True, unlimited=True),
            PlanFeature(name="Priority Support", description="24/7 priority support", included=True),
            PlanFeature(name="API Access", description="Extended API access", included=True, limit=50000),
            PlanFeature(name="Team Management", description="Up to 10 team members", included=True, limit=10),
            PlanFeature(name="Integrations", description="All integrations included", included=True, unlimited=True),
        ],
        limits={
            "emails_per_month": 10000,
            "reports_per_month": -1,  # unlimited
            "api_calls_per_month": 50000,
            "team_members": 10,
            "integrations": -1  # unlimited
        },
        popular=True
    ),
    PlanType.ENTERPRISE: PlanDetails(
        type=PlanType.ENTERPRISE,
        name="Enterprise",
        description="Full-scale solution for large organizations",
        monthly_price=Decimal('79.00'),
        annual_price=Decimal('790.00'),
        annual_discount_percent=17,
        features=[
            PlanFeature(name="Email Analysis", description="Unlimited email scanning", included=True, unlimited=True),
            PlanFeature(name="Enterprise Threat Detection", description="Custom ML models", included=True),
            PlanFeature(name="Advanced Analytics", description="Custom dashboards and reports", included=True, unlimited=True),
            PlanFeature(name="Dedicated Support", description="Dedicated account manager", included=True),
            PlanFeature(name="Unlimited API", description="Unlimited API access", included=True, unlimited=True),
            PlanFeature(name="Unlimited Team", description="Unlimited team members", included=True, unlimited=True),
            PlanFeature(name="Custom Integrations", description="Custom integration development", included=True),
            PlanFeature(name="SLA Guarantee", description="99.9% uptime SLA", included=True),
            PlanFeature(name="On-premise Deployment", description="Private cloud deployment", included=True),
        ],
        limits={
            "emails_per_month": -1,  # unlimited
            "reports_per_month": -1,  # unlimited
            "api_calls_per_month": -1,  # unlimited
            "team_members": -1,  # unlimited
            "integrations": -1  # unlimited
        }
    )
}
