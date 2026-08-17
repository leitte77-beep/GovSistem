"""Base declarativa e mixins comuns a todas as tabelas do GovCompras.

Os tipos foram escolhidos para funcionar tanto em PostgreSQL (produção) quanto
em SQLite (suíte de testes): `Uuid` genérico, `JSON` com variante JSONB no PG e
`Numeric` para valores monetários (arredondamento binário seria inaceitável).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON as SA_JSON
from sqlalchemy import DateTime, ForeignKey, Numeric, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JSONType = SA_JSON().with_variant(JSONB(), "postgresql")

Quantidade = Numeric(14, 3, asdecimal=False)
Dinheiro = Numeric(14, 2, asdecimal=False)


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKeyMixin:
    """Identificadores não previsíveis — nada de sequência exposta na URL."""

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Datas de criação e alteração.

    Os valores são gerados em Python (com `server_default` só como garantia no
    DDL). Isso evita que o SQLAlchemy expire o atributo após um UPDATE e tente
    recarregá-lo fora do contexto assíncrono — origem clássica do erro
    `MissingGreenlet` ao serializar o objeto logo depois do commit.
    """

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


class ActorMixin:
    """Quem criou e quem alterou por último."""

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("govcompras_users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("govcompras_users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )


class SoftDeleteMixin:
    """Exclusão lógica: dado administrativo importante nunca é apagado de
    verdade (seção 67 — "não permitir exclusão física de registros")."""

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None, index=True
    )
    deleted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("govcompras_users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    delete_reason: Mapped[str | None] = mapped_column(String(400), nullable=True)

    @property
    def excluido(self) -> bool:
        return self.deleted_at is not None


class ConcurrencyMixin:
    """Controle otimista: o cliente devolve a versão que leu.

    Se outro usuário alterou o registro no meio do caminho, a API responde 409
    com mensagem clara em vez de sobrescrever o trabalho alheio.
    """

    row_version: Mapped[int] = mapped_column(default=1, nullable=False)


__all__ = [
    "ActorMixin",
    "Base",
    "ConcurrencyMixin",
    "Dinheiro",
    "JSONType",
    "Quantidade",
    "SoftDeleteMixin",
    "TimestampMixin",
    "UUIDPrimaryKeyMixin",
    "utcnow",
]
