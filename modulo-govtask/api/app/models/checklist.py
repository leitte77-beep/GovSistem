"""Checklists configuráveis da Demanda (§32, §67).

O checklist responde "o que ainda falta?" de forma verificável. Ele pode nascer
de um modelo de demanda ou de uma etapa de workflow que exige documentos antes
de avançar; em ambos os casos o item concluído guarda quem concluiu e quando,
porque "3 de 5" sem autoria não serve de controle.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.demanda import Demanda
    from app.models.user import User


class Checklist(Base, TimestampMixin, SoftDeleteMixin):
    """Conjunto de itens exigidos em uma demanda ou etapa dela."""

    __tablename__ = "checklists"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    etapa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("etapas.id", ondelete="CASCADE"), nullable=True
    )
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Checklist obrigatório impede a conclusão da demanda enquanto houver item
    # obrigatório pendente (§145).
    obrigatorio: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    criado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    demanda: Mapped["Demanda"] = relationship("Demanda", back_populates="checklists")
    itens: Mapped[List["ChecklistItem"]] = relationship(
        "ChecklistItem",
        back_populates="checklist",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="ChecklistItem.ordem",
    )

    @property
    def total(self) -> int:
        return sum(1 for i in self.itens if i.deleted_at is None)

    @property
    def concluidos(self) -> int:
        return sum(1 for i in self.itens if i.deleted_at is None and i.concluido_em)

    @property
    def pendencias_obrigatorias(self) -> list[str]:
        return [
            i.descricao
            for i in self.itens
            if i.deleted_at is None and i.obrigatorio and not i.concluido_em
        ]

    def __repr__(self) -> str:
        return f"<Checklist {self.titulo} {self.concluidos}/{self.total}>"


class ChecklistItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "checklist_itens"

    checklist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("checklists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    obrigatorio: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Item que só fecha com documento anexado (§32).
    exige_documento: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    documento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("anexos.id", ondelete="SET NULL"), nullable=True
    )
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    concluido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    concluido_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    checklist: Mapped["Checklist"] = relationship("Checklist", back_populates="itens")
    documento: Mapped[Optional["Anexo"]] = relationship("Anexo", lazy="selectin")
    concluido_por: Mapped[Optional["User"]] = relationship("User", lazy="selectin")
