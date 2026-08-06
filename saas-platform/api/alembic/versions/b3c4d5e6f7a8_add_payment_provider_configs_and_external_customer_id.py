"""add_payment_provider_configs_and_external_customer_id

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-05-25 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('external_payment_customer_id', sa.String(255), nullable=True))
    op.create_table(
        'payment_provider_configs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('provider', sa.String(50), nullable=False, server_default='asaas'),
        sa.Column('environment', sa.String(20), nullable=False, server_default='sandbox'),
        sa.Column('api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('webhook_token_encrypted', sa.Text(), nullable=True),
        sa.Column('webhook_url', sa.String(500), nullable=True),
        sa.Column('pix_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('boleto_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('credit_card_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('default_billing_type', sa.String(20), nullable=False, server_default='UNDEFINED'),
        sa.Column('wallet_id', sa.String(100), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('created_by', UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('payment_provider_configs')
    op.drop_column('customers', 'external_payment_customer_id')
