"""add_subscription_events_and_coupons

Revision ID: 11e269f74541
Revises: 0cff298d34cd
Create Date: 2026-05-22 19:29:04.670310
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = '11e269f74541'
down_revision: Union[str, None] = '0cff298d34cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'subscription_events',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('subscription_id', UUID(as_uuid=True), sa.ForeignKey('subscriptions.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('event_type', sa.String(50), nullable=False, index=True),
        sa.Column('previous_status', sa.String(20), nullable=True),
        sa.Column('new_status', sa.String(20), nullable=True),
        sa.Column('previous_plan_id', UUID(as_uuid=True), nullable=True),
        sa.Column('new_plan_id', UUID(as_uuid=True), nullable=True),
        sa.Column('previous_price_cents', sa.Integer(), nullable=True),
        sa.Column('new_price_cents', sa.Integer(), nullable=True),
        sa.Column('prorata_amount_cents', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('triggered_by', UUID(as_uuid=True), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'coupons',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('code', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('discount_type', sa.String(10), nullable=False),
        sa.Column('discount_value_cents', sa.Integer(), nullable=True),
        sa.Column('discount_percent', sa.Float(), nullable=True),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('current_uses', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_uses_per_customer', sa.Integer(), nullable=True),
        sa.Column('applies_to_plan_ids', sa.JSON(), nullable=True),
        sa.Column('valid_from', sa.DateTime(timezone=True), nullable=True),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('first_time_only', sa.Boolean(), default=False),
        sa.Column('max_discount_cycles', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('coupons')
    op.drop_table('subscription_events')
