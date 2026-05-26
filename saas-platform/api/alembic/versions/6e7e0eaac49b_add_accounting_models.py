"""add_accounting_models

Revision ID: 6e7e0eaac49b
Revises: 11e269f74541
Create Date: 2026-05-22 19:29:56.970618
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON


revision: str = '6e7e0eaac49b'
down_revision: Union[str, None] = '11e269f74541'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'accounting_periods',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_by', UUID(as_uuid=True), nullable=True),
        sa.Column('reopened_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reopened_by', UUID(as_uuid=True), nullable=True),
        sa.Column('reopen_reason', sa.Text(), nullable=True),
        sa.Column('checklist', JSON, nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'year', 'month', name='uq_period_org_year_month'),
    )

    op.create_table(
        'journal_entries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('entry_number', sa.String(50), nullable=False, index=True),
        sa.Column('entry_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('competence_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('origin', sa.String(50), nullable=False),
        sa.Column('origin_id', sa.String(255), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft', index=True),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('posted_by', UUID(as_uuid=True), nullable=True),
        sa.Column('reversed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reversed_by', UUID(as_uuid=True), nullable=True),
        sa.Column('reverse_reason', sa.Text(), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'journal_entry_lines',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('entry_id', UUID(as_uuid=True), sa.ForeignKey('journal_entries.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('chart_of_accounts.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('debit_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('credit_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cost_center_id', UUID(as_uuid=True), nullable=True),
        sa.Column('customer_id', UUID(as_uuid=True), nullable=True),
        sa.Column('supplier_id', UUID(as_uuid=True), nullable=True),
        sa.Column('history', sa.Text(), nullable=True),
        sa.Column('reference', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'revenue_recognition_schedules',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('subscription_id', UUID(as_uuid=True), sa.ForeignKey('subscriptions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invoice_id', UUID(as_uuid=True), nullable=True),
        sa.Column('total_amount_cents', sa.Integer(), nullable=False),
        sa.Column('recognized_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('remaining_amount_cents', sa.Integer(), nullable=False),
        sa.Column('start_period', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_period', sa.DateTime(timezone=True), nullable=False),
        sa.Column('installments', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('recognized_installments', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('revenue_account_id', UUID(as_uuid=True), nullable=True),
        sa.Column('deferred_account_id', UUID(as_uuid=True), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('revenue_recognition_schedules')
    op.drop_table('journal_entry_lines')
    op.drop_table('journal_entries')
    op.drop_table('accounting_periods')
