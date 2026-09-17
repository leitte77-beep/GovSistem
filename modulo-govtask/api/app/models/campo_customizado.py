"""Campos adicionais configuráveis por tipo de demanda (§205, §206).

A definição (metadado) fica aqui; o valor de cada demanda continua em
`demandas.campos_extras`. Essa separação evita uma tabela de valores com uma
linha por campo, mantém a leitura da demanda em uma só consulta e — o ponto
central — permite validar o que é gravado contra a definição vigente.
"""

import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import TipoCampoCustomizado


class CampoCustomizado(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "campos_customizados"
    __table_args__ = (
        UniqueConstraint("organization_id", "chave", name="uq_campo_customizado_chave"),
        Index("ix_campos_customizados_org", "organization_id"),
        Index("ix_campos_customizados_tipo", "tipo_demanda_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo_demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demanda_tipos.id", ondelete="SET NULL"),
        nullable=True,
        comment="Nulo = o campo vale para todos os tipos",
    )
    chave: Mapped[str] = mapped_column(
        String(60), nullable=False,
        comment="Nome estável usado em campos_extras; não muda depois de criado",
    )
    rotulo: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo: Mapped[TipoCampoCustomizado] = mapped_column(String(20), nullable=False)
    obrigatorio: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ajuda: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    opcoes: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True, comment="Valores aceitos em SELECAO/MULTIPLA_ESCOLHA"
    )
    validacao: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Regras extras: {min, max, max_len, regex} — lista branca no serviço",
    )
