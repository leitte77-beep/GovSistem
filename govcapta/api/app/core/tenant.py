"""Tenant-scoped query helpers.

Every repository that handles organization data must start from this helper.
Looking up an entity by bare primary key is intentionally forbidden at the API layer.
"""
from uuid import UUID

from sqlalchemy import Select, select


def scoped_select(model: type, organization_id: UUID) -> Select:
    """Start a query with the mandatory organization predicate."""
    return select(model).where(model.organization_id == organization_id)
