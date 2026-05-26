"""add_signing_documents_and_jobs

Revision ID: a7b8c9d0e1f2
Revises: f3a2e1b4c5d6
Create Date: 2026-05-18 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f3a2e1b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('signing_documents',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('edition_id', sa.UUID(), nullable=True),
        sa.Column('filename', sa.String(length=500), nullable=False),
        sa.Column('sha256_original', sa.String(length=64), nullable=False),
        sa.Column('sha256_signed', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='pending'),
        sa.Column('signed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('signed_by', sa.UUID(), nullable=True),
        sa.Column('certificate_subject', sa.Text(), nullable=True),
        sa.Column('certificate_serial', sa.String(length=100), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['edition_id'], ['editions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['signed_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_signing_documents_edition_id'), 'signing_documents', ['edition_id'], unique=False)
    op.create_index(op.f('ix_signing_documents_status'), 'signing_documents', ['status'], unique=False)

    op.create_table('signing_jobs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('document_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='queued'),
        sa.Column('error_code', sa.String(length=50), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['signing_documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_signing_jobs_document_id'), 'signing_jobs', ['document_id'], unique=False)
    op.create_index(op.f('ix_signing_jobs_status'), 'signing_jobs', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_signing_jobs_status'), table_name='signing_jobs')
    op.drop_index(op.f('ix_signing_jobs_document_id'), table_name='signing_jobs')
    op.drop_table('signing_jobs')
    op.drop_index(op.f('ix_signing_documents_status'), table_name='signing_documents')
    op.drop_index(op.f('ix_signing_documents_edition_id'), table_name='signing_documents')
    op.drop_table('signing_documents')
