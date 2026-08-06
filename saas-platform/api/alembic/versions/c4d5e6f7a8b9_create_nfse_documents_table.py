"""create_nfse_documents_table

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-05-25 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nfse_documents',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('invoice_id', UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='SET NULL'), nullable=True),
        sa.Column('customer_id', UUID(as_uuid=True), nullable=True),
        sa.Column('provider', sa.String(100), nullable=False, server_default='sandbox'),
        sa.Column('environment', sa.String(20), nullable=False, server_default='sandbox'),
        sa.Column('status', sa.String(30), nullable=False, server_default='draft', index=True),
        sa.Column('rps_number', sa.String(50), nullable=True, index=True),
        sa.Column('nfse_number', sa.String(50), nullable=True, index=True),
        sa.Column('verification_code', sa.String(50), nullable=True),
        sa.Column('access_key', sa.String(100), nullable=True),
        sa.Column('service_code', sa.String(20), nullable=True),
        sa.Column('service_description', sa.Text(), nullable=True),
        sa.Column('gross_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('iss_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ibs_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cbs_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('net_amount_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('issue_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('competence_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('xml_content', sa.Text(), nullable=True),
        sa.Column('pdf_content_base64', sa.Text(), nullable=True),
        sa.Column('protocol', sa.String(100), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('provider_payload', sa.JSON(), nullable=True),
        sa.Column('provider_response', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('nfse_documents')
