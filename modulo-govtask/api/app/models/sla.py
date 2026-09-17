"""SLA interno por organização/setor/tipo/prioridade (§152–§154).

SLA interno é compromisso de gestão, não prazo legal: um pedido de ofício ao
Jurídico pode ter meta de dois dias úteis sem que exista qualquer obrigação
legal nesse sentido. Por isso vive em tabela própria e nunca sobrescreve
`prazo_legal`.
"""

import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import PrioridadeDemanda, TipoContagemSla


class SlaConfig(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sla_config"
    __table_args__ = (
        Index("ix_sla_config_org", "organization_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo_demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demanda_tipos.id", ondelete="SET NULL")
    )
    setor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL")
    )
    prioridade: Mapped[Optional[PrioridadeDemanda]] = mapped_column(String(15), nullable=True)
    valor: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="Quantidade de horas/dias conforme a contagem"
    )
    contagem: Mapped[TipoContagemSla] = mapped_column(
        String(20), nullable=False, default=TipoContagemSla.DIAS_UTEIS
    )
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
