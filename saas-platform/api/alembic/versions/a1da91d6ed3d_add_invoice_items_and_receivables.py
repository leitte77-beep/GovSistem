"""add_invoice_items_and_receivables

Revision ID: a1da91d6ed3d
Revises: 6e7e0eaac49b
Create Date: 2026-05-22 19:30:43.305115
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'a1da91d6ed3d'
down_revision: Union[str, None] = '6e7e0eaac49b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'invoice_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('invoice_id', UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('unit_price_cents', sa.Integer(), nullable=False),
        sa.Column('gross_amount_cents', sa.Integer(), nullable=False),
        sa.Column('discount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tax_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('net_amount_cents', sa.Integer(), nullable=False),
        sa.Column('plan_id', UUID(as_uuid=True), nullable=True),
        sa.Column('service_code', sa.String(20), nullable=True),
        sa.Column('cnae', sa.String(10), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'receivables',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('invoice_id', UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='SET NULL'), nullable=True),
        sa.Column('customer_id', UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('installment_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('total_installments', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('original_amount_cents', sa.Integer(), nullable=False),
        sa.Column('open_amount_cents', sa.Integer(), nullable=False),
        sa.Column('received_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column('competence_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='open', index=True),
        sa.Column('payment_method', sa.String(50), nullable=True),
        sa.Column('bank_account_id', UUID(as_uuid=True), nullable=True),
        sa.Column('interest_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('fine_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('discount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('settled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('settled_by', UUID(as_uuid=True), nullable=True),
        sa.Column('settlement_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('receivables')
    op.drop_table('invoice_items')
