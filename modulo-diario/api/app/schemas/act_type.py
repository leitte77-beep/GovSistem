import uuid

from pydantic import BaseModel, ConfigDict, model_validator

from app.core.act_type_config import (
    ActTypeConfigError,
    normalize_config,
)


class ActTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    is_active: bool = True
    config: dict | None = None


class ActTypeUpdate(BaseModel):
    """Admin edit of an act type. ``config`` is validated/normalized server-side
    so administrators never paste raw, unvalidated JSON."""

    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    config: dict | None = None

    @model_validator(mode="after")
    def validate_config(self):
        if self.config is not None:
            try:
                normalized = normalize_config(self.config)
            except ActTypeConfigError as exc:
                raise ValueError(str(exc)) from exc
            object.__setattr__(self, "config", normalized)
        return self


class ActTypeCreate(ActTypeUpdate):
    name: str
