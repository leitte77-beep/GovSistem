import uuid
from datetime import datetime

from pydantic import BaseModel


class SettingCreate(BaseModel):
    key: str
    value: str | None = None
    description: str | None = None
    category: str = "general"
    type: str = "string"
    is_encrypted: bool = False
    is_public: bool = False


class SettingUpdate(BaseModel):
    value: str | None = None
    description: str | None = None


class SettingOut(BaseModel):
    id: uuid.UUID
    key: str
    value: str | None
    description: str | None
    category: str
    type: str
    is_encrypted: bool
    is_public: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
