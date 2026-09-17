import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import StatusAssinatura

if TYPE_CHECKING:
    from app.models.demanda import Demanda
    from app.models.user import User


class AssinaturaDocumento(Base, TimestampMixin):
    """Ciclo de vida da assinatura de um grupo de documentos (§78).

    Uma linha por grupo (`documento_grupo_id`). O arquivo em si pode ganhar
    novas versões; o que esta entidade guarda é o estado da assinatura e a
    evidência devolvida pelo módulo de assinatura.

    A transição para `ASSINADO` não é exposta a usuários comuns: ela depende da
    rota interna que recebe referência e hash do assinador. Isso é o que impede
    uma "assinatura" que ninguém assinou.
    """

    __tablename__ = "documento_assinaturas"
    __table_args__ = (
        UniqueConstraint("documento_grupo_id", name="uq_assinatura_documento_grupo"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    documento_grupo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False,
        comment="Grupo de versões do documento (§31) a que a assinatura se refere",
    )
    anexo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("anexos.id", ondelete="SET NULL"), nullable=True,
        comment="Versão corrente no momento da solicitação/assinatura",
    )

    status: Mapped[StatusAssinatura] = mapped_column(
        String(30), nullable=False, default=StatusAssinatura.RASCUNHO
    )

    solicitado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    solicitado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revisado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    revisado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    assinado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assinado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Evidência do assinador. Sem referência + hash não há como declarar assinado.
    referencia_externa: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    provedor: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    hash_assinado: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    motivo_cancelamento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    demanda: Mapped["Demanda"] = relationship("Demanda")
    # `selectin`: a resposta serializa os nomes logo após o commit, e um lazy
    # load fora do contexto async estouraria MissingGreenlet.
    solicitado_por: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[solicitado_por_id], lazy="selectin"
    )
    assinado_por: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[assinado_por_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<AssinaturaDocumento {self.documento_grupo_id} [{self.status.value}]>"
