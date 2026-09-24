import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class AuthorityCreate(BaseModel):
    name: str
    role: str | None = None
    org_unit_id: uuid.UUID | None = None
    is_active: bool = True
    valid_from: date | None = None
    valid_until: date | None = None
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty")
        return v


class AuthorityUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    org_unit_id: uuid.UUID | None = None
    is_active: bool | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    notes: str | None = None


class AuthorityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str | None = None
    org_unit_id: uuid.UUID | None = None
    org_unit_name: str | None = None
    is_active: bool = True
    valid_from: date | None = None
    valid_until: date | None = None
    notes: str | None = None
    created_at: datetime | None = None
