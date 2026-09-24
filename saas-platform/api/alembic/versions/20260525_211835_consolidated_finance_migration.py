"""consolidated finance migration - all remaining tables and columns"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "fin_consolidated_migration"
down_revision: Union[str, None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Add columns to invoices (IF NOT EXISTS via raw SQL)
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id UUID")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_policy VARCHAR(30)")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fiscal_policy VARCHAR(30)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_customer_id ON invoices(customer_id)")

    # 2. Add tax_rule_snapshot to nfse_documents
    op.execute("ALTER TABLE nfse_documents ADD COLUMN IF NOT EXISTS tax_rule_snapshot JSONB")

    # 3. Add new columns to suppliers
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT")
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city VARCHAR(100)")
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state VARCHAR(2)")
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10)")
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_term_days INTEGER NOT NULL DEFAULT 30")

    # 4. Add columns to cost_centers (different from old 'responsible' column)
    op.execute("ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS description TEXT")
    op.execute("ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS manager_name VARCHAR(255)")
    op.execute("ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS budget_cents INTEGER")

    # 5. Add columns to subscription_events
    op.execute("ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS organization_id UUID")
    op.execute("ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS old_status VARCHAR(30)")
    op.execute("ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS new_status VARCHAR(30)")
    op.execute("ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS amount_cents INTEGER")
    op.execute("ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS details JSONB")
    op.execute("ALTER TABLE subscription_events ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(100)")

    # 6. Add columns to invoice_items
    op.execute("ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit_amount_cents INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS total_amount_cents INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS revenue_account_id UUID")
    op.execute("ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_rule_snapshot JSONB")

    # 7. Create dunning_rules
    op.execute("""
        CREATE TABLE IF NOT EXISTS dunning_rules (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            days_after_due INTEGER NOT NULL,
            action VARCHAR(50) NOT NULL,
            action_config JSONB,
            send_email BOOLEAN NOT NULL DEFAULT true,
            email_template TEXT,
            send_sms BOOLEAN NOT NULL DEFAULT false,
            charge_fee_cents INTEGER NOT NULL DEFAULT 0,
            charge_interest_daily DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            suspend_subscription BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            "order" INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dunning_rules_organization_id ON dunning_rules(organization_id)")

    # 8. Create dunning_events
    op.execute("""
        CREATE TABLE IF NOT EXISTS dunning_events (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
            invoice_id UUID,
            rule_id UUID,
            action VARCHAR(50) NOT NULL,
            days_overdue INTEGER NOT NULL,
            amount_cents INTEGER NOT NULL,
            result VARCHAR(30) NOT NULL,
            error_message TEXT,
            executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dunning_events_subscription_id ON dunning_events(subscription_id)")

    # 9. Create webhook_events
    op.execute("""
        CREATE TABLE IF NOT EXISTS webhook_events (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            organization_id UUID,
            provider VARCHAR(50) NOT NULL,
            environment VARCHAR(20) NOT NULL,
            external_event_id VARCHAR(255),
            event_type VARCHAR(100) NOT NULL,
            external_object_id VARCHAR(255),
            payload_hash VARCHAR(64),
            payload_sanitized JSONB,
            signature_valid BOOLEAN NOT NULL DEFAULT false,
            processing_status VARCHAR(20) NOT NULL DEFAULT 'received',
            attempts INTEGER NOT NULL DEFAULT 1,
            received_at TIMESTAMP WITH TIME ZONE NOT NULL,
            processed_at TIMESTAMP WITH TIME ZONE,
            error_message TEXT,
            idempotency_key VARCHAR(255) UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_webhook_events_org_id ON webhook_events(organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_webhook_events_event_type ON webhook_events(event_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_webhook_events_status ON webhook_events(processing_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_webhook_events_external_id ON webhook_events(external_event_id)")

    # 10. Create subscription_billing_cycles
    op.execute("""
        CREATE TABLE IF NOT EXISTS subscription_billing_cycles (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            invoice_id UUID,
            cycle_number INTEGER NOT NULL,
            period_start TIMESTAMP WITH TIME ZONE NOT NULL,
            period_end TIMESTAMP WITH TIME ZONE NOT NULL,
            amount_cents INTEGER NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            paid_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_billing_cycles_sub_id ON subscription_billing_cycles(subscription_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_billing_cycles_org_id ON subscription_billing_cycles(organization_id)")

    # 11. Create customer_debts
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_debts (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            customer_id UUID NOT NULL,
            subscription_id UUID,
            invoice_id UUID,
            original_amount_cents INTEGER NOT NULL,
            open_amount_cents INTEGER NOT NULL,
            due_date TIMESTAMP WITH TIME ZONE NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'open',
            debt_type VARCHAR(30) NOT NULL DEFAULT 'overdue_invoice',
            notes TEXT,
            actions JSONB,
            last_action_at TIMESTAMP WITH TIME ZONE,
            settled_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_debts_org_id ON customer_debts(organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_debts_customer_id ON customer_debts(customer_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_customer_debts_status ON customer_debts(status)")

    # 12. Create approval tables
    op.execute("""
        CREATE TABLE IF NOT EXISTS approval_workflows (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            min_amount_cents INTEGER,
            max_amount_cents INTEGER,
            requires_approval BOOLEAN NOT NULL DEFAULT true,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_approval_workflows_org_id ON approval_workflows(organization_id)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS approval_steps (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
            step_order INTEGER NOT NULL,
            approver_role VARCHAR(50),
            approver_user_id UUID,
            min_amount_cents INTEGER,
            max_amount_cents INTEGER,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_approval_steps_workflow_id ON approval_steps(workflow_id)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS approval_requests (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            entity_type VARCHAR(50) NOT NULL,
            entity_id VARCHAR(255) NOT NULL,
            workflow_id UUID,
            current_step INTEGER NOT NULL DEFAULT 1,
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            requested_by UUID,
            requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
            decided_at TIMESTAMP WITH TIME ZONE,
            decision_reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_approval_requests_org_id ON approval_requests(organization_id)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS approval_decisions (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
            step INTEGER NOT NULL,
            approver_id UUID NOT NULL,
            decision VARCHAR(20) NOT NULL,
            reason TEXT,
            decided_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_approval_decisions_request_id ON approval_decisions(request_id)")

    # 13. Create payable_attachments
    op.execute("""
        CREATE TABLE IF NOT EXISTS payable_attachments (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            payable_id UUID NOT NULL REFERENCES payables(id) ON DELETE CASCADE,
            filename VARCHAR(255) NOT NULL,
            original_filename VARCHAR(255) NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            storage_path TEXT NOT NULL,
            uploaded_by UUID,
            description TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_payable_attachments_payable_id ON payable_attachments(payable_id)")

    # 14. Create tax_rule tables
    op.execute("""
        CREATE TABLE IF NOT EXISTS tax_rule_sets (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_tax_rule_sets_org_id ON tax_rule_sets(organization_id)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS tax_rule_versions (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            rule_set_id UUID NOT NULL REFERENCES tax_rule_sets(id) ON DELETE CASCADE,
            "version" INTEGER NOT NULL,
            valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
            valid_to TIMESTAMP WITH TIME ZONE,
            tax_regime VARCHAR(30) NOT NULL,
            service_code VARCHAR(20),
            city_code VARCHAR(10),
            iss_rate DOUBLE PRECISION,
            ibs_rate DOUBLE PRECISION,
            cbs_rate DOUBLE PRECISION,
            cst VARCHAR(10),
            cclass_trib VARCHAR(20),
            ind_op VARCHAR(4),
            source_reference TEXT,
            approved_by UUID,
            approved_at TIMESTAMP WITH TIME ZONE,
            rules JSONB,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_tax_rule_versions_set_id ON tax_rule_versions(rule_set_id)")

def downgrade() -> None:
    op.drop_table("tax_rule_versions")
    op.drop_table("tax_rule_sets")
    op.drop_table("payable_attachments")
    op.drop_table("approval_decisions")
    op.drop_table("approval_requests")
    op.drop_table("approval_steps")
    op.drop_table("approval_workflows")
    op.drop_table("customer_debts")
    op.drop_table("subscription_billing_cycles")
    op.drop_table("webhook_events")
    op.drop_table("dunning_events")
    op.drop_table("dunning_rules")
    op.execute("ALTER TABLE invoice_items DROP COLUMN IF EXISTS tax_rule_snapshot")
    op.execute("ALTER TABLE invoice_items DROP COLUMN IF EXISTS revenue_account_id")
    op.execute("ALTER TABLE invoice_items DROP COLUMN IF EXISTS total_amount_cents")
    op.execute("ALTER TABLE invoice_items DROP COLUMN IF EXISTS unit_amount_cents")
    op.execute("ALTER TABLE subscription_events DROP COLUMN IF EXISTS triggered_by")
    op.execute("ALTER TABLE subscription_events DROP COLUMN IF EXISTS details")
    op.execute("ALTER TABLE subscription_events DROP COLUMN IF EXISTS amount_cents")
    op.execute("ALTER TABLE subscription_events DROP COLUMN IF EXISTS new_status")
    op.execute("ALTER TABLE subscription_events DROP COLUMN IF EXISTS old_status")
    op.execute("ALTER TABLE subscription_events DROP COLUMN IF EXISTS organization_id")
    op.execute("ALTER TABLE cost_centers DROP COLUMN IF EXISTS budget_cents")
    op.execute("ALTER TABLE cost_centers DROP COLUMN IF EXISTS manager_name")
    op.execute("ALTER TABLE cost_centers DROP COLUMN IF EXISTS description")
    op.execute("ALTER TABLE suppliers DROP COLUMN IF EXISTS payment_term_days")
    op.execute("ALTER TABLE suppliers DROP COLUMN IF EXISTS zip_code")
    op.execute("ALTER TABLE suppliers DROP COLUMN IF EXISTS state")
    op.execute("ALTER TABLE suppliers DROP COLUMN IF EXISTS city")
    op.execute("ALTER TABLE suppliers DROP COLUMN IF EXISTS address")
    op.execute("ALTER TABLE nfse_documents DROP COLUMN IF EXISTS tax_rule_snapshot")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS fiscal_policy")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS payment_policy")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS customer_id")
