import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ChamadoSuporte(Base, TimestampMixin):
    """Chamado aberto pelo posto (portal do fornecedor) para a equipe do GovFrota:
    problema, pedido de correção, dúvida ou sugestão. A equipe responde e muda a
    situação; o posto acompanha pelo portal."""

    __tablename__ = "chamados_suporte"
    __table_args__ = (Index("ix_chamados_org_numero", "organization_id", "numero", unique=True),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fornecedores.id"), nullable=True, index=True
    )
    acesso_fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("acessos_fornecedor.id", ondelete="SET NULL"), nullable=True
    )
    numero: Mapped[int] = mapped_column(Integer(), nullable=False)
    # PROBLEMA | CORRECAO | DUVIDA | SUGESTAO
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    assunto: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[str] = mapped_column(Text(), nullable=False)
    abastecimento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("abastecimentos.id", ondelete="SET NULL"), nullable=True
    )
    aberto_por: Mapped[str] = mapped_column(String(150), nullable=False)
    contato: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    # ABERTO | EM_ANDAMENTO | RESOLVIDO
    status: Mapped[str] = mapped_column(String(20), default="ABERTO", nullable=False)
    resposta: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    respondido_por: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    respondido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
