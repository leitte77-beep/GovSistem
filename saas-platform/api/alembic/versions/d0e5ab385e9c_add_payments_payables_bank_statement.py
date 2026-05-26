"""add_payments_payables_bank_statement

Revision ID: d0e5ab385e9c
Revises: a1da91d6ed3d
Create Date: 2026-05-22 19:31:25.970618
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON


revision: str = 'd0e5ab385e9c'
down_revision: Union[str, None] = 'a1da91d6ed3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'payables',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('supplier_id', UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('document_number', sa.String(100), nullable=True),
        sa.Column('account_id', UUID(as_uuid=True), nullable=True),
        sa.Column('cost_center_id', UUID(as_uuid=True), nullable=True),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column('competence_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft', index=True),
        sa.Column('payment_method', sa.String(50), nullable=True),
        sa.Column('bank_account_id', UUID(as_uuid=True), nullable=True),
        sa.Column('requires_approval', sa.Boolean(), default=False),
        sa.Column('approved_by', UUID(as_uuid=True), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_amount_cents', sa.Integer(), nullable=True),
        sa.Column('receipt_proof', sa.String(500), nullable=True),
        sa.Column('retentions', JSON, nullable=True),
        sa.Column('is_recurring', sa.Boolean(), default=False),
        sa.Column('recurring_cron', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'boleto_charges',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('invoice_id', UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='SET NULL'), nullable=True),
        sa.Column('customer_id', UUID(as_uuid=True), nullable=True),
        sa.Column('bank_account_id', UUID(as_uuid=True), nullable=True),
        sa.Column('provider', sa.String(100), nullable=False),
        sa.Column('agreement_code', sa.String(50), nullable=True),
        sa.Column('wallet', sa.String(20), nullable=True),
        sa.Column('our_number', sa.String(50), nullable=True),
        sa.Column('digitable_line', sa.String(100), nullable=True),
        sa.Column('barcode', sa.String(100), nullable=True),
        sa.Column('pix_qr_code', sa.Text(), nullable=True),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('interest_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('fine_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('discount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='created', index=True),
        sa.Column('external_id', sa.String(255), nullable=True, index=True),
        sa.Column('pdf_url', sa.String(500), nullable=True),
        sa.Column('registered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('settled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expired_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cnab_return_data', JSON, nullable=True),
        sa.Column('webhook_payload', JSON, nullable=True),
        sa.Column('error_log', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'pix_charges',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('invoice_id', UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='SET NULL'), nullable=True),
        sa.Column('receivable_id', UUID(as_uuid=True), nullable=True),
        sa.Column('customer_id', UUID(as_uuid=True), nullable=True),
        sa.Column('txid', sa.String(100), nullable=True, index=True),
        sa.Column('end_to_end_id', sa.String(100), nullable=True, index=True),
        sa.Column('qr_code', sa.Text(), nullable=True),
        sa.Column('qr_code_image', sa.Text(), nullable=True),
        sa.Column('copy_paste', sa.Text(), nullable=True),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('expiration_seconds', sa.Integer(), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='created', index=True),
        sa.Column('provider', sa.String(100), nullable=False),
        sa.Column('external_id', sa.String(255), nullable=True, index=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('refunded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('webhook_payload', JSON, nullable=True),
        sa.Column('error_log', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'payment_transactions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('invoice_id', UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='SET NULL'), nullable=True),
        sa.Column('receivable_id', UUID(as_uuid=True), nullable=True),
        sa.Column('customer_id', UUID(as_uuid=True), nullable=True),
        sa.Column('gateway', sa.String(100), nullable=False),
        sa.Column('payment_method', sa.String(30), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('gateway_fee_cents', sa.Integer(), nullable=True),
        sa.Column('installments', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(30), nullable=False, server_default='created', index=True),
        sa.Column('authorization_code', sa.String(100), nullable=True),
        sa.Column('nsu', sa.String(100), nullable=True),
        sa.Column('tid', sa.String(100), nullable=True),
        sa.Column('external_id', sa.String(255), nullable=True, index=True),
        sa.Column('card_brand', sa.String(20), nullable=True),
        sa.Column('card_last_four', sa.String(4), nullable=True),
        sa.Column('card_token', sa.String(255), nullable=True),
        sa.Column('authorized_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expected_settlement_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_settlement_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('chargeback_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('refunded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('refund_amount_cents', sa.Integer(), nullable=True),
        sa.Column('extra_data', JSON, nullable=True),
        sa.Column('is_sandbox', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'bank_statements',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('bank_account_id', UUID(as_uuid=True), sa.ForeignKey('bank_accounts.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('source', sa.String(50), nullable=False),
        sa.Column('filename', sa.String(255), nullable=True),
        sa.Column('file_hash', sa.String(64), nullable=True),
        sa.Column('imported_by', UUID(as_uuid=True), nullable=True),
        sa.Column('imported_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='imported'),
        sa.Column('line_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('reconciled_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'bank_statement_lines',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('statement_id', UUID(as_uuid=True), sa.ForeignKey('bank_statements.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('transaction_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('transaction_type', sa.String(10), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('document', sa.String(100), nullable=True),
        sa.Column('bank_identifier', sa.String(255), nullable=True),
        sa.Column('balance_cents', sa.Integer(), nullable=True),
        sa.Column('reconciliation_status', sa.String(30), nullable=False, server_default='unreconciled'),
        sa.Column('matched_transaction_id', sa.String(255), nullable=True),
        sa.Column('matched_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('matched_by', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('bank_statement_lines')
    op.drop_table('bank_statements')
    op.drop_table('payment_transactions')
    op.drop_table('pix_charges')
    op.drop_table('boleto_charges')
    op.drop_table('payables')
