from fastapi import APIRouter

from app.api.v1.accounting_periods import router as accounting_periods_router
from app.api.v1.approval_workflows import router as approval_workflows_router
from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.cep import router as cep_router
from app.api.v1.chart_of_accounts import router as chart_of_accounts_router
from app.api.v1.charges import router as charges_router
from app.api.v1.closing import router as closing_router
from app.api.v1.customers import router as customers_router
from app.api.v1.backups import router as backups_router
from app.api.v1.bank_statements import router as bank_statements_router
from app.api.v1.cost_centers import router as cost_centers_router
from app.api.v1.webhook_events import router as webhook_events_router
from app.api.v1.webhooks import router as webhooks_router
from app.api.v1.boletos import router as boletos_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.feature_flags import router as feature_flags_router
from app.api.v1.finance_redirect import router as finance_redirect_router
from app.api.v1.financial import router as financial_router
from app.api.v1.invoice_charges import router as invoice_charges_router
from app.api.v1.invoice_items import router as invoice_items_router
from app.api.v1.invoices import router as invoices_router
from app.api.v1.journal_entries import router as journal_entries_router
from app.api.v1.metrics import router as metrics_router
from app.api.v1.modules import router as modules_router
from app.api.v1.nfse import router as nfse_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.plans import router as plans_router
from app.api.v1.payables import router as payables_router
from app.api.v1.payment_charges import router as payment_charges_router
from app.api.v1.payment_provider_configs import router as payment_provider_configs_router
from app.api.v1.receivables import router as receivables_router
from app.api.v1.reports import router as reports_router
from app.api.v1.reports_export import router as reports_export_router
from app.api.v1.reports_finance import router as reports_finance_router
from app.api.v1.subscriptions import router as subscriptions_router
from app.api.v1.users import router as users_router

api_router = APIRouter()

api_router.include_router(accounting_periods_router)
api_router.include_router(approval_workflows_router)
api_router.include_router(audit_router)
api_router.include_router(auth_router)
api_router.include_router(cep_router)
api_router.include_router(chart_of_accounts_router)
api_router.include_router(charges_router)
api_router.include_router(closing_router)
api_router.include_router(customers_router)
api_router.include_router(backups_router)
api_router.include_router(bank_statements_router)
api_router.include_router(cost_centers_router)
api_router.include_router(webhook_events_router)
api_router.include_router(webhooks_router)
api_router.include_router(boletos_router)
api_router.include_router(dashboard_router)
api_router.include_router(feature_flags_router)
api_router.include_router(finance_redirect_router)
api_router.include_router(financial_router)
api_router.include_router(invoice_charges_router)
api_router.include_router(invoice_items_router)
api_router.include_router(invoices_router)
api_router.include_router(journal_entries_router)
api_router.include_router(metrics_router)
api_router.include_router(modules_router)
api_router.include_router(nfse_router)
api_router.include_router(organizations_router)
api_router.include_router(plans_router)
api_router.include_router(payables_router)
api_router.include_router(payment_charges_router)
api_router.include_router(payment_provider_configs_router)
api_router.include_router(receivables_router)
api_router.include_router(reports_router)
api_router.include_router(reports_export_router)
api_router.include_router(reports_finance_router)
api_router.include_router(subscriptions_router)
api_router.include_router(users_router)
