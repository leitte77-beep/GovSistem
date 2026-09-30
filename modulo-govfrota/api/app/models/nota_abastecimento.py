import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NotaAbastecimento(Base, TimestampMixin):
    """Nota fiscal que o posto envia para um abastecimento (XML e/ou DANFE).

    Nunca é apagada: um arquivo novo do mesmo tipo desativa o anterior
    (`ativo=False`, `versao` crescente).
    """

    __tablename__ = "abastecimento_notas"
    __table_args__ = (
        Index("ix_abast_notas_org_criado", "organization_id", "created_at"),
        Index("ix_abast_notas_org_chave", "organization_id", "nfe_chave"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    abastecimento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("abastecimentos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fornecedor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fornecedores.id"), nullable=False)
    # NFE_XML | DANFE
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    anexo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("anexos.id"), nullable=False)
    nome_arquivo: Mapped[str] = mapped_column(String(255), nullable=False)
    hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    versao: Mapped[int] = mapped_column(Integer(), default=1, nullable=False)
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False)
    desativado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    enviado_por_acesso_fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    enviado_por_usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Lidos do XML (só NFE_XML)
    nfe_chave: Mapped[Optional[str]] = mapped_column(String(44), nullable=True)
    nfe_numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    nfe_serie: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    nfe_emissao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    nfe_emitente_cnpj: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)
    nfe_valor_total: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    avisos: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
