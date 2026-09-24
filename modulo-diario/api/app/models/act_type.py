from typing import Optional

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import JSONB, Base, SoftDeleteMixin, TimestampMixin


class ActType(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "act_types"

    name: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Optional per-type rules: number_required, year_required, "
                "title_pattern ({name} Nº {number}/{year}), title_uppercase",
    )

    def __repr__(self) -> str:
        return f"<ActType {self.name}>"
