"""Base declarativa e mixins comuns a todas as tabelas do GovDoc.

Tipos escolhidos para funcionar tanto em PostgreSQL (produção) quanto em SQLite
(suite de testes): `Uuid` genérico e `JSON` genérico com variante JSONB no PG.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JSONType = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKeyMixin:
    """Identificadores não previsíveis para todo recurso sensível."""

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Datas de criação e alteração.

    Os valores são gerados em Python (com `server_default` apenas como garantia
    no DDL). Isso evita que o SQLAlchemy expire o atributo após um UPDATE e
    tente recarregá-lo fora do contexto assíncrono — origem clássica do erro
    `MissingGreenlet` ao serializar o objeto logo depois do commit.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
        nullable=False,
    )


class ActorMixin:
    """Quem criou e quem alterou por último."""

    @staticmethod
    def _fk() -> Mapped[Optional[uuid.UUID]]:  # pragma: no cover - documentação
        ...

    # `use_alter` evita ciclo de dependência na criação das tabelas
    # (institutions → users → institutions).
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    updated_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )


class SoftDeleteMixin:
    """Exclusão lógica: nada some do banco por padrão (lixeira)."""

    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None, index=True
    )
    deleted_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    delete_reason: Mapped[Optional[str]] = mapped_column(nullable=True)

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class ConcurrencyMixin:
    """Controle otimista de concorrência em metadados."""

    row_version: Mapped[int] = mapped_column(default=1, nullable=False)


__all__ = [
    "Base",
    "JSONType",
    "UUIDPrimaryKeyMixin",
    "TimestampMixin",
    "ActorMixin",
    "SoftDeleteMixin",
    "ConcurrencyMixin",
]
