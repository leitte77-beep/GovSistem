"""Schemas for the external integration API."""

from __future__ import annotations

from pydantic import Field

from app.schemas.matter import MatterCreate


class IntegrationMatterCreate(MatterCreate):
    """A matter pushed by an external GovSistem module.

    Extends ``MatterCreate`` with a mandatory acting human server
    (``author_email``) who receives the matter into the editorial workflow.
    The external module never publishes directly.
    """

    author_email: str = Field(
        ...,
        description="E-mail de um usuário real do órgão que assume a autoria",
    )
