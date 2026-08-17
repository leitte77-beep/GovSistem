import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TenantMixin, TimestampMixin
from app.models.enums import TipoPessoa


class Interessado(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Parte do processo (PF ou PJ); pode não ser usuário do sistema."""

    __tablename__ = "interessados"
    __table_args__ = (
        Index("ix_interessados_tenant_nome", "tenant_id", "nome"),
        Index("ix_interessados_tenant_doc", "tenant_id", "cpf_cnpj"),
        Index("ix_interessados_tenant_processo", "tenant_id", "processo_id"),
    )

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )

    tipo_pessoa: Mapped[str] = mapped_column(String(2), default=TipoPessoa.PF.value, nullable=False)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    cpf_cnpj: Mapped[Optional[str]] = mapped_column(
        String(18),
        nullable=True,
        comment="CPF/CNPJ — mascarado em listagens (LGPD); nunca em log/URL",
    )
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    endereco: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<Interessado {self.nome}>"
