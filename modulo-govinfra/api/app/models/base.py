"""Base declarativa e mixins comuns a todas as tabelas do GovInfra.

Os tipos foram escolhidos para funcionar tanto em PostgreSQL (produção) quanto
em SQLite (suíte de testes): `Uuid` genérico, `JSON` com variante JSONB no PG e
`Numeric` para valores em que arredondamento binário seria inaceitável (horas,
litros, dinheiro).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Numeric,
    String,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JSONType = JSON().with_variant(JSONB(), "postgresql")

# Horas e litros: 2 casas decimais, sem erro de ponto flutuante acumulado.
# `asdecimal=False` mantém a API trabalhando com float (o banco continua exato).
Quantidade = Numeric(12, 2, asdecimal=False)
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
        ForeignKey("govinfra_users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("govinfra_users.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )


class SoftDeleteMixin:
    """Exclusão lógica: dado operacional nunca é apagado de verdade."""

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None, index=True
    )
    deleted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("govinfra_users.id", ondelete="SET NULL", use_alter=True),
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


class GeoMixin:
    """Ponto no mapa.

    Colunas simples de latitude/longitude com índice composto — funcionam em
    qualquer PostgreSQL e no SQLite dos testes. As consultas de proximidade
    fazem pré-filtro por caixa e depois Haversine (`app/core/geo.py`).
    """

    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    precisao_coordenada: Mapped[str | None] = mapped_column(String(40), nullable=True)

    @property
    def tem_coordenada(self) -> bool:
        return self.latitude is not None and self.longitude is not None


def indice_geo(nome: str, tabela: str) -> Index:
    """Índice composto (latitude, longitude) usado pelo pré-filtro por caixa."""
    return Index(nome, f"{tabela}.c.latitude", f"{tabela}.c.longitude")


__all__ = [
    "ActorMixin",
    "Base",
    "ConcurrencyMixin",
    "Dinheiro",
    "GeoMixin",
    "JSONType",
    "Quantidade",
    "SoftDeleteMixin",
    "TimestampMixin",
    "UUIDPrimaryKeyMixin",
    "utcnow",
]
