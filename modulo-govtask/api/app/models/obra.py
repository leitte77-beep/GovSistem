import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.convenio import Convenio
    from app.models.user import User


class Obra(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "obras"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    nome: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    endereco: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    coordenadas: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    objeto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    empresa: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cnpj_empresa: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    contrato_numero: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    responsavel_tecnico: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    fiscal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    gestor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    data_inicio: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    previsao_conclusao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    valor_contrato: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    situacao: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    percentual_fisico: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    percentual_financeiro: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    convenio: Mapped["Convenio"] = relationship("Convenio", back_populates="obras")
    fiscal: Mapped[Optional["User"]] = relationship("User", foreign_keys=[fiscal_id])
    gestor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[gestor_id])
    cronograma: Mapped[list["CronogramaItem"]] = relationship(
        "CronogramaItem", back_populates="obra", lazy="selectin",
        cascade="all, delete-orphan", order_by="CronogramaItem.ordem",
    )
    diario: Mapped[list["DiarioObra"]] = relationship(
        "DiarioObra", back_populates="obra", lazy="selectin",
        cascade="all, delete-orphan",
    )
    fotos: Mapped[list["RegistroFotografico"]] = relationship(
        "RegistroFotografico", back_populates="obra", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Obra {self.nome or self.id}>"


class CronogramaItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "cronogramas_fisico_financeiro"

    obra_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("obras.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    valor: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    percentual_previsto: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    percentual_realizado: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    data_inicio_prevista: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data_fim_prevista: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ordem: Mapped[int] = mapped_column(default=0, nullable=False)

    obra: Mapped["Obra"] = relationship("Obra", back_populates="cronograma")

    def __repr__(self) -> str:
        return f"<CronogramaItem {self.descricao[:40]}>"


class DiarioObra(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "diario_obra"

    obra_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("obras.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, default="VISITA")
    data: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    titulo: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    registrado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    obra: Mapped["Obra"] = relationship("Obra", back_populates="diario")
    registrado_por: Mapped[Optional["User"]] = relationship("User", foreign_keys=[registrado_por_id])

    def __repr__(self) -> str:
        return f"<DiarioObra {self.tipo} {self.data or ''}>"


class RegistroFotografico(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "registros_fotograficos"

    obra_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("obras.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    data: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    etapa: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    medicao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicoes.id", ondelete="SET NULL"), nullable=True
    )
    latitude: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    longitude: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    anexo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("anexos.id", ondelete="SET NULL"), nullable=True
    )
    registrado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    obra: Mapped["Obra"] = relationship("Obra", back_populates="fotos")
    registrado_por: Mapped[Optional["User"]] = relationship("User", foreign_keys=[registrado_por_id])

    def __repr__(self) -> str:
        return f"<RegistroFotografico {self.data or ''}>"
