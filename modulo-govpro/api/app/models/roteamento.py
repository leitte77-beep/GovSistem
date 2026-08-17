"""Regras automáticas de encaminhamento (roteamento de processos).

Permite que o ente configure destinos por tipo de processo e condições sobre o
assunto/classificação/nível de acesso. O motor avalia as regras ativas por
prioridade (maior vence) e, sem correspondência, o processo cai no Protocolo
Central para triagem humana — nunca fica sem destino (Lei 14.129/2021).
"""

import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TenantMixin, TimestampMixin


class RegraEncaminhamento(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "regras_encaminhamento"
    __table_args__ = (
        Index("ix_regras_enc_tenant_ativa", "tenant_id", "ativa"),
        Index("ix_regras_enc_tenant_tipo", "tenant_id", "tipo_processo_id"),
    )

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo_processo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tipos_processo.id", ondelete="CASCADE"),
        nullable=True,
        comment="Regra específica de um tipo (NULL = qualquer tipo)",
    )
    condicoes: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        comment=(
            "Condições AND: [{campo, operador, valor}] — campos: especificacao "
            "(CONTEM/NAO_CONTEM/IGUAL/DIFERENTE), nivel_acesso, classe_id (IGUAL/DIFERENTE)"
        ),
    )
    unidade_destino_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="RESTRICT"),
        nullable=False,
    )
    prioridade: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<RegraEncaminhamento {self.nome} -> {self.unidade_destino_id}>"
