"""Base declarativa e mixins comuns a todas as tabelas do GovSaúde."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JSONType = JSON().with_variant(JSONB(), "postgresql")
Dinheiro = Numeric(14, 2, asdecimal=False)
Quantidade = Numeric(14, 3, asdecimal=False)


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
        nullable=False,
    )


class TenantMixin:
    """Toda tabela de negócio começa por ``tenant_id``.

    ``organizacoes.id`` é o tenant. As consultas devem sempre filtrar esta
    coluna; o acesso cruzado retorna 404.
    """

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("organizacoes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )


class ActorMixin:
    criado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("usuarios.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    atualizado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("usuarios.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )


class VersaoMixin:
    """Concorrência otimista. O PATCH envia ``If-Match`` com esta versão."""

    versao: Mapped[int] = mapped_column(default=1, nullable=False)


class BaixaMixin:
    """Baixa lógica: nunca há DELETE físico de dado de negócio."""

    baixa_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    baixa_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    baixa_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("usuarios.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )

    @property
    def ativo(self) -> bool:
        return self.baixa_em is None


class VigenciaMixin:
    vigencia_inicio: Mapped[date] = mapped_column(
        Date, default=date.today, nullable=False
    )
    vigencia_fim: Mapped[date | None] = mapped_column(Date, nullable=True)

    @property
    def vigente(self) -> bool:
        hoje = date.today()
        return self.vigencia_inicio <= hoje and (
            self.vigencia_fim is None or self.vigencia_fim >= hoje
        )


def indice_tenant(nome: str, tabela: str, *colunas: str) -> Index:
    return Index(nome, f"{tabela}.c.tenant_id", *(f"{tabela}.c.{c}" for c in colunas))


__all__ = [
    "ActorMixin",
    "BaixaMixin",
    "Base",
    "Dinheiro",
    "JSONType",
    "Quantidade",
    "String",
    "TenantMixin",
    "TimestampMixin",
    "UUIDPrimaryKeyMixin",
    "VersaoMixin",
    "VigenciaMixin",
    "indice_tenant",
    "utcnow",
]
