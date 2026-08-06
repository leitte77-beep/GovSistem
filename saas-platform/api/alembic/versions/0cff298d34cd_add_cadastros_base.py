"""add_cadastros_base

Revision ID: 0cff298d34cd
Revises: 711c83c75d0b
Create Date: 2026-05-22 19:27:26.570795
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON


revision: str = '0cff298d34cd'
down_revision: Union[str, None] = '711c83c75d0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'companies',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('legal_name', sa.String(255), nullable=False),
        sa.Column('trade_name', sa.String(255), nullable=True),
        sa.Column('cnpj', sa.String(18), unique=True, nullable=True, index=True),
        sa.Column('state_registration', sa.String(50), nullable=True),
        sa.Column('municipal_registration', sa.String(50), nullable=True),
        sa.Column('main_cnae', sa.String(10), nullable=True),
        sa.Column('secondary_cnaes', sa.Text(), nullable=True),
        sa.Column('tax_regime', sa.String(30), nullable=True),
        sa.Column('simples_annex', sa.String(10), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(2), nullable=True),
        sa.Column('fiscal_address', sa.Text(), nullable=True),
        sa.Column('fiscal_email', sa.String(255), nullable=True),
        sa.Column('fiscal_phone', sa.String(20), nullable=True),
        sa.Column('fiscal_responsible', sa.String(255), nullable=True),
        sa.Column('accountant_name', sa.String(255), nullable=True),
        sa.Column('accountant_email', sa.String(255), nullable=True),
        sa.Column('accountant_crc', sa.String(20), nullable=True),
        sa.Column('has_digital_certificate', sa.Boolean(), default=False),
        sa.Column('nfse_config', JSON, nullable=True),
        sa.Column('cbs_ibs_config', JSON, nullable=True),
        sa.Column('retention_config', JSON, nullable=True),
        sa.Column('cash_basis', sa.Boolean(), default=True),
        sa.Column('config_effective_from', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='active', index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'company_branches',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('cnpj', sa.String(18), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(2), nullable=True),
        sa.Column('municipal_registration', sa.String(50), nullable=True),
        sa.Column('state_registration', sa.String(50), nullable=True),
        sa.Column('is_matrix', sa.Boolean(), default=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='active', index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'customers',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('legal_name', sa.String(255), nullable=True),
        sa.Column('doc_type', sa.String(10), nullable=False, server_default='cpf'),
        sa.Column('doc_number', sa.String(18), nullable=False, index=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('billing_email', sa.String(255), nullable=True),
        sa.Column('fiscal_email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(2), nullable=True),
        sa.Column('zip_code', sa.String(10), nullable=True),
        sa.Column('country', sa.String(50), nullable=False, server_default='Brasil'),
        sa.Column('is_taxpayer', sa.Boolean(), default=True),
        sa.Column('customer_type', sa.String(20), nullable=False, server_default='b2c'),
        sa.Column('payment_preference', sa.String(50), nullable=True),
        sa.Column('credit_limit_cents', sa.Integer(), nullable=True),
        sa.Column('credit_limit_used_cents', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('internal_notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'suppliers',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('legal_name', sa.String(255), nullable=True),
        sa.Column('doc_type', sa.String(10), nullable=False, server_default='cpf'),
        sa.Column('doc_number', sa.String(18), nullable=False, index=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('bank_code', sa.String(10), nullable=True),
        sa.Column('bank_agency', sa.String(10), nullable=True),
        sa.Column('bank_account', sa.String(20), nullable=True),
        sa.Column('pix_key', sa.String(255), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('cost_center_id', UUID(as_uuid=True), nullable=True),
        sa.Column('chart_account_id', UUID(as_uuid=True), nullable=True),
        sa.Column('fiscal_info', JSON, nullable=True),
        sa.Column('retentions', JSON, nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'bank_accounts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('bank_code', sa.String(10), nullable=False),
        sa.Column('bank_name', sa.String(255), nullable=True),
        sa.Column('agency', sa.String(10), nullable=False),
        sa.Column('account_number', sa.String(20), nullable=False),
        sa.Column('account_type', sa.String(20), nullable=False, server_default='checking'),
        sa.Column('holder_name', sa.String(255), nullable=False),
        sa.Column('holder_doc', sa.String(18), nullable=True),
        sa.Column('pix_key', sa.String(255), nullable=True),
        sa.Column('boleto_agreement', sa.String(50), nullable=True),
        sa.Column('boleto_wallet', sa.String(20), nullable=True),
        sa.Column('boleto_our_number', sa.String(50), nullable=True),
        sa.Column('cnab_config', JSON, nullable=True),
        sa.Column('webhook_config', JSON, nullable=True),
        sa.Column('credentials', sa.Text(), nullable=True),
        sa.Column('environment', sa.String(20), nullable=False, server_default='sandbox'),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='active', index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'chart_of_accounts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('account_type', sa.String(20), nullable=False),
        sa.Column('nature', sa.String(10), nullable=False),
        sa.Column('parent_id', UUID(as_uuid=True), sa.ForeignKey('chart_of_accounts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('accepts_manual_entry', sa.Boolean(), default=True),
        sa.Column('is_system', sa.Boolean(), default=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('fiscal_mapping', JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'cost_centers',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('parent_id', UUID(as_uuid=True), nullable=True),
        sa.Column('responsible', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'fiscal_profiles',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('tax_regime', sa.String(30), nullable=False),
        sa.Column('cnae', sa.String(10), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(2), nullable=True),
        sa.Column('municipal_registration', sa.String(50), nullable=True),
        sa.Column('service_code', sa.String(20), nullable=True),
        sa.Column('default_iss_aliquot', sa.Float(), nullable=True),
        sa.Column('iss_retained', sa.Boolean(), default=False),
        sa.Column('tax_responsible', sa.String(255), nullable=True),
        sa.Column('is_simples_nacional', sa.Boolean(), default=False),
        sa.Column('is_mei', sa.Boolean(), default=False),
        sa.Column('is_lucro_presumido', sa.Boolean(), default=False),
        sa.Column('is_lucro_real', sa.Boolean(), default=False),
        sa.Column('cbs_ibs_applicable', sa.Boolean(), default=False),
        sa.Column('retention_rules', JSON, nullable=True),
        sa.Column('nfse_provider', sa.String(100), nullable=True),
        sa.Column('environment', sa.String(20), nullable=False, server_default='sandbox'),
        sa.Column('digital_certificate_id', sa.String(255), nullable=True),
        sa.Column('valid_from', sa.DateTime(timezone=True), nullable=False),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_by', sa.String(255), nullable=True),
        sa.Column('normative_source', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('fiscal_profiles')
    op.drop_table('cost_centers')
    op.drop_table('chart_of_accounts')
    op.drop_table('bank_accounts')
    op.drop_table('suppliers')
    op.drop_table('customers')
    op.drop_table('company_branches')
    op.drop_table('companies')
