import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class MessageResponse(BaseModel):
    message: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    cpf: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AccessLogEntry(BaseModel):
    action: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    force_password_reset: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class ModuleAccessRequest(BaseModel):
    module_slug: str
    redirect_url: Optional[str] = None


class ModuleTokenResponse(BaseModel):
    module_token: str
    module_url: str
    expires_in: int


import re

CPF_RE = re.compile(r"^\d{11}$")


def _validate_cpf_digits(cpf: str) -> bool:
    """Validate CPF check digits."""
    if len(set(cpf)) == 1:
        return False
    for i in range(9, 11):
        s = sum(int(cpf[j]) * ((i + 1) - j) for j in range(i))
        d = (s * 10) % 11
        if d == 10:
            d = 0
        if int(cpf[i]) != d:
            return False
    return True


class UserCreate(BaseModel):
    organization_id: Optional[uuid.UUID] = None
    name: str
    email: EmailStr
    password: str
    cpf: Optional[str] = None
    phone: Optional[str] = None
    is_platform_admin: bool = False
    platform_role: Optional[str] = None
    module_permissions: Optional[list[str]] = None
    is_organization_admin: bool = False
    force_password_reset: bool = True

    @field_validator("organization_id", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "" or v is None:
            return None
        return uuid.UUID(v) if isinstance(v, str) else v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 72:
            raise ValueError("Password must be at most 72 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = re.sub(r"\D", "", v)
        if not cleaned:
            return None
        if not CPF_RE.match(cleaned):
            raise ValueError("CPF must be exactly 11 digits")
        if not _validate_cpf_digits(cleaned):
            raise ValueError("Invalid CPF check digits")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        cleaned = re.sub(r"\D", "", v)
        if len(cleaned) < 10 or len(cleaned) > 11:
            raise ValueError("Phone must be 10 or 11 digits (DDD + number)")
        return cleaned


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    cpf: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    is_platform_admin: Optional[bool] = None
    platform_role: Optional[str] = None
    organization_id: Optional[uuid.UUID] = None
    module_permissions: Optional[list[str]] = None
    is_organization_admin: Optional[bool] = None
    force_password_reset: Optional[bool] = None

    @field_validator("organization_id", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "" or v is None:
            return None
        return uuid.UUID(v) if isinstance(v, str) else v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 72:
            raise ValueError("Password must be at most 72 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = re.sub(r"\D", "", v)
        if not cleaned:
            return None
        if not CPF_RE.match(cleaned):
            raise ValueError("CPF must be exactly 11 digits")
        if not _validate_cpf_digits(cleaned):
            raise ValueError("Invalid CPF check digits")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        cleaned = re.sub(r"\D", "", v)
        if len(cleaned) < 10 or len(cleaned) > 11:
            raise ValueError("Phone must be 10 or 11 digits (DDD + number)")
        return cleaned


class OrganizationCreate(BaseModel):
    name: str
    slug: str
    cnpj: Optional[str] = None
    description: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_street: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_neighborhood: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    public_url: Optional[str] = None
    is_active: bool = True
    plan_slug: Optional[str] = None
    admin_name: Optional[str] = None
    admin_email: Optional[str] = None
    admin_password: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    cnpj: Optional[str] = None
    description: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_street: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_neighborhood: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    logo_url: Optional[str] = None
    public_url: Optional[str] = None
    is_active: Optional[bool] = None


class PlanCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    max_orgs: int = 1
    max_users: int = 5
    max_storage_gb: int = 1
    has_custom_domain: bool = False
    has_white_label: bool = False
    has_api_access: bool = False
    has_priority_support: bool = False
    allowed_modules: Optional[list[str]] = None
    billing_cycle: str = "monthly"
    price_cents: int = 0
    setup_fee_cents: int = 0
    trial_days: int = 0
    is_active: bool = True
    is_public: bool = True


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    max_orgs: Optional[int] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    has_custom_domain: Optional[bool] = None
    has_white_label: Optional[bool] = None
    has_api_access: Optional[bool] = None
    has_priority_support: Optional[bool] = None
    allowed_modules: Optional[list[str]] = None
    billing_cycle: Optional[str] = None
    price_cents: Optional[int] = None
    setup_fee_cents: Optional[int] = None
    trial_days: Optional[int] = None
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None


class PlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    max_orgs: int
    max_users: int
    max_storage_gb: int
    has_custom_domain: bool
    has_white_label: bool
    has_api_access: bool
    has_priority_support: bool
    allowed_modules: Optional[list]
    billing_cycle: str
    price_cents: int
    setup_fee_cents: int
    trial_days: int
    is_active: bool
    is_public: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModuleCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    base_url: str
    api_url: str
    admin_url: Optional[str] = None
    public_url: Optional[str] = None
    is_active: bool = True
    version: str = "1.0.0"


class ModuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    base_url: Optional[str] = None
    api_url: Optional[str] = None
    admin_url: Optional[str] = None
    public_url: Optional[str] = None
    is_active: Optional[bool] = None
    version: Optional[str] = None


class ModuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    icon: Optional[str]
    base_url: str
    api_url: str
    admin_url: Optional[str]
    public_url: Optional[str]
    is_active: bool
    version: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrganizationModuleCreate(BaseModel):
    organization_id: uuid.UUID
    module_id: uuid.UUID
    is_active: bool = True
    custom_settings: Optional[dict] = None


class OrganizationModuleResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    module_id: uuid.UUID
    is_active: bool
    custom_settings: Optional[dict]
    created_at: datetime
    updated_at: datetime
    module: Optional[ModuleResponse] = None

    model_config = {"from_attributes": True}


class SubscriptionCreate(BaseModel):
    organization_id: uuid.UUID
    plan_id: uuid.UUID
    trial_days_override: Optional[int] = None
    auto_renew: bool = True


class SubscriptionUpdate(BaseModel):
    plan_id: Optional[uuid.UUID] = None
    status: Optional[str] = None
    auto_renew: Optional[bool] = None


class UserResponse(BaseModel):
    id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
    name: str
    email: str
    cpf: Optional[str] = None
    is_active: bool = True
    is_platform_admin: bool = False
    is_organization_admin: bool = False
    platform_role: Optional[str] = None
    mfa_enabled: bool = False
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    module_permissions: Optional[list[str]] = None
    force_password_reset: bool = False
    created_at: datetime
    updated_at: datetime

    @field_validator("module_permissions", mode="before")
    @classmethod
    def json_to_list(cls, v):
        if isinstance(v, dict):
            return v.get("modules", []) if v else []
        return v

    model_config = {"from_attributes": True}


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    cnpj: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    plan_id: uuid.UUID
    status: str
    started_at: datetime
    current_period_start: datetime
    current_period_end: datetime
    trial_ends_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    auto_renew: bool
    created_at: datetime
    updated_at: datetime
    plan: Optional[PlanResponse] = None
    organization: Optional[OrganizationResponse] = None

    model_config = {"from_attributes": True}


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    subscription_id: uuid.UUID
    customer_id: Optional[uuid.UUID] = None
    invoice_number: str
    status: str
    amount_cents: int
    paid_amount_cents: Optional[int] = None
    due_date: datetime
    paid_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    payment_policy: Optional[str] = None
    fiscal_policy: Optional[str] = None
    period_start: datetime
    period_end: datetime
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BackupConfigCreate(BaseModel):
    organization_id: uuid.UUID
    name: str
    enabled: bool = True
    cron_expression: Optional[str] = None
    retention_days: int = 30
    storage_type: str = "s3"
    storage_config: Optional[dict] = None
    included_modules: Optional[list[str]] = None
    encrypt: bool = True
    notify_on_success: bool = False
    notify_on_failure: bool = True
    notification_emails: Optional[list[str]] = None


class BackupConfigUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    cron_expression: Optional[str] = None
    retention_days: Optional[int] = None
    storage_type: Optional[str] = None
    storage_config: Optional[dict] = None
    included_modules: Optional[list[str]] = None
    encrypt: Optional[bool] = None
    notify_on_success: Optional[bool] = None
    notify_on_failure: Optional[bool] = None
    notification_emails: Optional[list[str]] = None


class BackupConfigResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    enabled: bool
    cron_expression: Optional[str]
    retention_days: int
    storage_type: str
    encrypt: bool
    notify_on_success: bool
    notify_on_failure: bool
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BackupLogResponse(BaseModel):
    id: uuid.UUID
    config_id: uuid.UUID
    backup_type: str
    status: str
    file_path: Optional[str]
    file_size_bytes: Optional[int]
    started_at: datetime
    completed_at: Optional[datetime]
    error_message: Optional[str]
    triggered_by: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel):
    data: list
    total: int
    page: int = 1
    per_page: int = 50


class AuditEventResponse(BaseModel):
    id: uuid.UUID
    actor_id: Optional[uuid.UUID]
    actor_email: Optional[str]
    organization_id: Optional[uuid.UUID]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    details: Optional[dict]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FinancialRecordCreate(BaseModel):
    organization_id: uuid.UUID
    kind: str = "revenue"
    description: str
    amount_cents: int
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None


class FinancialRecordResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    kind: str
    description: str
    amount_cents: int
    balance_cents: int
    reference_type: Optional[str]
    reference_id: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    subscription_id: uuid.UUID
    amount_cents: int
    due_date: datetime
    period_start: datetime
    period_end: datetime
    notes: Optional[str] = None


class SubscriptionWithInvoicesResponse(SubscriptionResponse):
    invoices: list[InvoiceResponse] = []


class ModuleInfo(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None
    version: str
    is_active: bool
    admin_url: Optional[str] = None

    model_config = {"from_attributes": True}


class DiskInfo(BaseModel):
    total_gb: float
    used_gb: float
    free_gb: float
    percent_used: float


class DashboardStats(BaseModel):
    total_organizations: int
    active_organizations: int
    total_users: int
    total_subscriptions: int
    active_subscriptions: int
    monthly_recurring_revenue_cents: int
    total_modules: int
    recent_invoices_count: int
    modules: list[ModuleInfo] = []
    last_publication_ago: str = "—"
    online_users_count: int = 0
    system_status: str = "Operacional"
    disk: Optional[DiskInfo] = None
