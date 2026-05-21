import uuid
from datetime import datetime

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str
    mfa_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserRoleOut(BaseModel):
    id: uuid.UUID
    name: str
    label: str

    model_config = {"from_attributes": True}


class UserMeResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    is_active: bool
    organization_id: uuid.UUID | None
    roles: list[UserRoleOut]
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreateRequest(BaseModel):
    name: str
    email: str
    password: str
    organization_id: uuid.UUID
    role_names: list[str] = []


class UserUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    is_active: bool | None = None
    role_names: list[str] | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    is_active: bool
    organization_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
