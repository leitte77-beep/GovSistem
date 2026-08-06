"""add missing indexes

Revision ID: e1f2g3h4i5j6
Revises: d1e2f3g4h5i6
Create Date: 2026-06-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f2g3h4i5j6"
down_revision: Union[str, None] = "d1e2f3g4h5i6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_edition_items_matter_id", "edition_items", ["matter_id"], if_not_exists=True)
    op.create_index("ix_edition_items_edition_id_position", "edition_items", ["edition_id", "position"], if_not_exists=True)
    op.create_index("ix_matters_org_unit_id", "matters", ["org_unit_id"], if_not_exists=True)
    op.create_index("ix_matters_act_type_id", "matters", ["act_type_id"], if_not_exists=True)
    op.create_index("ix_matters_author_id", "matters", ["author_id"], if_not_exists=True)
    op.create_index("ix_matters_published_at", "matters", ["published_at"], if_not_exists=True)
    op.create_index("ix_editions_publication_date", "editions", ["publication_date"], if_not_exists=True)
    op.create_index("ix_matter_attachments_file_id", "matter_attachments", ["file_id"], if_not_exists=True)
    op.create_index("ix_signing_jobs_status", "signing_jobs", ["status"], if_not_exists=True)
    op.create_index("ix_signing_documents_status", "signing_documents", ["status"], if_not_exists=True)
    op.create_index("ix_users_is_active", "users", ["is_active"], if_not_exists=True)
    op.create_index("ix_organizations_is_active", "organizations", ["is_active"], if_not_exists=True)
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"], if_not_exists=True)
    op.create_index("ix_signing_credentials_is_active", "signing_credentials", ["is_active"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_signing_credentials_is_active", if_exists=True)
    op.drop_index("ix_refresh_tokens_expires_at", if_exists=True)
    op.drop_index("ix_organizations_is_active", if_exists=True)
    op.drop_index("ix_users_is_active", if_exists=True)
    op.drop_index("ix_signing_documents_status", if_exists=True)
    op.drop_index("ix_signing_jobs_status", if_exists=True)
    op.drop_index("ix_matter_attachments_file_id", if_exists=True)
    op.drop_index("ix_editions_publication_date", if_exists=True)
    op.drop_index("ix_matters_published_at", if_exists=True)
    op.drop_index("ix_matters_author_id", if_exists=True)
    op.drop_index("ix_matters_act_type_id", if_exists=True)
    op.drop_index("ix_matters_org_unit_id", if_exists=True)
    op.drop_index("ix_edition_items_edition_id_position", if_exists=True)
    op.drop_index("ix_edition_items_matter_id", if_exists=True)
