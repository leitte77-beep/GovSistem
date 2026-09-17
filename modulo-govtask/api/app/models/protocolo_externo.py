"""Protocolos em sistemas externos e seu acompanhamento (§33, §34)."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusProtocolo

if TYPE_CHECKING:
    from app.models.demanda import Demanda
    from app.models.user import User


class ProtocoloExterno(Base, TimestampMixin, SoftDeleteMixin):
    """Registro de que algo foi protocolado fora do Município.

    É o ponto em que a demanda sai do controle interno: guarda sistema, órgão,
    número e o próximo acompanhamento, para que nada fique parado esperando
    resposta sem alguém cobrar.
    """

    __tablename__ = "protocolos_externos"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    sistema: Mapped[str] = mapped_column(
        String(120), nullable=False,
        comment="Transferegov, SEI, e-Protocolo, portal de ministério, ...",
    )
    orgao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    ano: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    data_protocolo: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    situacao: Mapped[StatusProtocolo] = mapped_column(
        String(30), nullable=False, default=StatusProtocolo.PROTOCOLADO, index=True
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prazo_resposta: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    proxima_verificacao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    demanda: Mapped["Demanda"] = relationship("Demanda", back_populates="protocolos")
    responsavel: Mapped[Optional["User"]] = relationship("User")
    atualizacoes: Mapped[List["ProtocoloAtualizacao"]] = relationship(
        "ProtocoloAtualizacao", back_populates="protocolo",
        lazy="selectin", cascade="all, delete-orphan",
        order_by="ProtocoloAtualizacao.ocorrido_em",
    )

    def __repr__(self) -> str:
        return f"<ProtocoloExterno {self.sistema}#{self.numero}>"


class ProtocoloAtualizacao(Base, TimestampMixin):
    """Cada movimentação do protocolo no órgão externo. Append-only."""

    __tablename__ = "protocolo_atualizacoes"

    protocolo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("protocolos_externos.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    situacao: Mapped[StatusProtocolo] = mapped_column(String(30), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    ocorrido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    registrado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    protocolo: Mapped["ProtocoloExterno"] = relationship(
        "ProtocoloExterno", back_populates="atualizacoes"
    )
