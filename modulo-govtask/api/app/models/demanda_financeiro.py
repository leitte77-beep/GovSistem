"""Acompanhamento financeiro gerencial da Demanda (§59, §60, §61).

Não substitui o sistema contábil: aqui o valor é **gerencial**, serve para o
gabinete saber quanto foi captado, contratado e pago sem abrir o empenho. Por
isso cada lançamento aponta o documento que o comprova em vez de tentar
reproduzir a escrituração.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import TipoRegistroFinanceiro

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.demanda import Demanda
    from app.models.user import User


class RegistroFinanceiroDemanda(Base, TimestampMixin, SoftDeleteMixin):
    """Um lançamento gerencial da demanda (empenho, pagamento, nota, ...)."""

    __tablename__ = "demanda_registros_financeiros"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[TipoRegistroFinanceiro] = mapped_column(
        String(30), nullable=False, index=True
    )
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    data_registro: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    numero_documento: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    fonte_recurso: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    favorecido: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Comprovante na central de documentos da própria demanda.
    documento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("anexos.id", ondelete="SET NULL"), nullable=True
    )
    registrado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    demanda: Mapped["Demanda"] = relationship(
        "Demanda", back_populates="registros_financeiros"
    )
    documento: Mapped[Optional["Anexo"]] = relationship("Anexo", lazy="selectin")
    registrado_por: Mapped["User"] = relationship("User", lazy="selectin")

    def __repr__(self) -> str:
        return f"<RegistroFinanceiroDemanda {self.tipo} {self.valor}>"
