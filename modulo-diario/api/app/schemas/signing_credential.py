import uuid
from datetime import datetime

from pydantic import BaseModel


class SigningCredentialOut(BaseModel):
    id: uuid.UUID
    label: str
    provider_type: str
    certificate_serial: str | None
    certificate_subject: str | None
    certificate_issuer: str | None
    valid_from: datetime | None
    valid_until: datetime | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
