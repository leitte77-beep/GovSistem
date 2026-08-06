import enum


class PlanBillingCycle(str, enum.Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    ANNUAL = "annual"


class SubscriptionStatus(str, enum.Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    PAUSED = "paused"
    PENDING_PAYMENT = "pending_payment"
    OVERDUE = "overdue"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    RENEGOTIATING = "renegotiating"
    REACTIVATED = "reactivated"


class InvoiceStatus(str, enum.Enum):
    PENDING = "pending"
    DRAFT = "draft"
    OPEN = "open"
    AWAITING_PAYMENT = "awaiting_payment"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    CHARGEBACK = "chargeback"
    WRITTEN_OFF = "written_off"


class ReceivableStatus(str, enum.Enum):
    OPEN = "open"
    DUE = "due"
    OVERDUE = "overdue"
    IN_COLLECTION = "in_collection"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    RENEGOTIATED = "renegotiated"
    CANCELLED = "cancelled"
    WRITTEN_OFF = "written_off"
    PROTESTED = "protested"
    CHARGEBACK = "chargeback"
    REFUNDED = "refunded"


class PayableStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    REVERSED = "reversed"


class BoletoStatus(str, enum.Enum):
    CREATED = "created"
    REGISTERED = "registered"
    REGISTRATION_FAILED = "registration_failed"
    ISSUED = "issued"
    PAID = "paid"
    EXPIRED = "expired"
    WRITTEN_OFF = "written_off"
    CANCELLED = "cancelled"
    PROTEST_REQUESTED = "protest_requested"
    ERROR = "error"


class PixStatus(str, enum.Enum):
    CREATED = "created"
    ACTIVE = "active"
    PAID = "paid"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentTransactionStatus(str, enum.Enum):
    CREATED = "created"
    AUTHORIZED = "authorized"
    CAPTURED = "captured"
    PAID = "paid"
    FAILED = "failed"
    REFUSED = "refused"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    CHARGEBACK = "chargeback"
    IN_DISPUTE = "in_dispute"


class PaymentMethod(str, enum.Enum):
    BOLETO = "boleto"
    PIX = "pix"
    CREDIT_CARD = "credit_card"
    DEBIT_CARD = "debit_card"
    TRANSFER = "transfer"
    MANUAL = "manual"


class FiscalDocumentStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_ISSUANCE = "pending_issuance"
    SENT = "sent"
    AUTHORIZED = "authorized"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    REPLACED = "replaced"
    TECHNICAL_ERROR = "technical_error"
    AWAITING_CONSULT = "awaiting_consult"
    CONTINGENCY = "contingency"


class JournalEntryStatus(str, enum.Enum):
    DRAFT = "draft"
    POSTED = "posted"
    REVERSED = "reversed"


class TaxRegime(str, enum.Enum):
    MEI = "mei"
    SIMPLES_NACIONAL = "simples_nacional"
    LUCRO_PRESUMIDO = "lucro_presumido"
    LUCRO_REAL = "lucro_real"
    OTHER = "other"


class AccountType(str, enum.Enum):
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"
    DEDUCTION = "deduction"
    COST = "cost"


class AccountNature(str, enum.Enum):
    DEBIT = "debit"
    CREDIT = "credit"


class ReconciliationStatus(str, enum.Enum):
    UNRECONCILED = "unreconciled"
    SUGGESTED = "suggested"
    AUTO_RECONCILED = "auto_reconciled"
    MANUALLY_RECONCILED = "manually_reconciled"
    DIVERGENT = "divergent"
    IGNORED = "ignored"


class TaxObligationType(str, enum.Enum):
    PGDAS_D = "pgdas_d"
    DEFIS = "defis"
    DAS = "das"
    ECD = "ecd"
    ECF = "ecf"
    EFD = "efd"
    DCTFWEB = "dctfweb"
    OTHER = "other"


class TaxObligationStatus(str, enum.Enum):
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    DECLARED = "declared"
    PAID = "paid"


class ApprovalWorkflowStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class BackupType(str, enum.Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class BackupStatus(str, enum.Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    MODULE_ACCESS = "module_access"
    BACKUP_START = "backup_start"
    BACKUP_COMPLETE = "backup_complete"


class PlatformRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
    BILLING_MANAGER = "BILLING_MANAGER"
    SUPPORT = "SUPPORT"
    AUDITOR = "AUDITOR"
