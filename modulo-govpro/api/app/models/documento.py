"""Documentos, versões, componentes digitais, assinaturas e blocos de assinatura.

Princípio: documento ASSINADO é imutável — não existe edição nem exclusão física.
Correções ocorrem por novo documento; retirada só por desentranhamento (Fase 2).
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TenantMixin, TimestampMixin
from app.models.enums import FormatoDocumento, NivelAcesso, NivelAssinatura, SituacaoDocumento


class Documento(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "documentos"
    __table_args__ = (
        Index("ix_documentos_tenant_processo", "tenant_id", "processo_id"),
        Index("ix_documentos_tenant_situacao", "tenant_id", "situacao"),
    )

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo_documento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tipos_documento.id", ondelete="SET NULL"),
        nullable=True,
    )
    numero: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    titulo: Mapped[str] = mapped_column(String(500), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    formato: Mapped[str] = mapped_column(
        String(20), default=FormatoDocumento.NATO_DIGITAL.value, nullable=False
    )
    nivel_acesso: Mapped[str] = mapped_column(
        String(20), default=NivelAcesso.PUBLICO.value, nullable=False
    )
    hipotese_legal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hipoteses_legais.id", ondelete="SET NULL"),
        nullable=True,
    )
    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoDocumento.RASCUNHO.value, nullable=False
    )
    assinado_em: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    criado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    criado_unidade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="SET NULL"),
        nullable=True,
        comment="Rascunho visível apenas na unidade produtora",
    )
    codigo_verificador: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        unique=True,
        comment="Código público de validação (sem login)",
    )
    hash_conteudo: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, comment="SHA-256 do conteúdo corrente"
    )
    versao_atual: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    sigilo_expira_em: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
        comment="Data de expiração automática do sigilo (LAI art. 24/31)",
    )
    eliminado_em: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
        comment="Expurgo lógico (eliminação arquivística) — metadados sobrevivem",
    )
    metadados_captura: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Metadados de digitalização (Anexo II, Decreto 10.278/2020)",
    )

    def __repr__(self) -> str:
        return f"<Documento {self.titulo}>"


class VersaoDocumento(Base, TimestampMixin):
    """Versão de um documento ANTES da assinatura. Após assinar, congela."""

    __tablename__ = "versoes_documento"
    __table_args__ = (UniqueConstraint("documento_id", "versao", name="uq_versao_documento"),)

    documento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    versao: Mapped[int] = mapped_column(Integer, nullable=False)
    conteudo_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    componente_digital_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("componentes_digitais.id", ondelete="SET NULL"),
        nullable=True,
    )
    criado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<VersaoDocumento doc={self.documento_id} v={self.versao}>"


class ComponenteDigital(Base, TimestampMixin, TenantMixin):
    """Arquivo físico + hash + mime + tamanho. Deduplicado por sha256."""

    __tablename__ = "componentes_digitais"

    sha256: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    sha512: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    mime: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tamanho: Mapped[int] = mapped_column(BigInteger, nullable=False)
    nome_original: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)

    def __repr__(self) -> str:
        return f"<ComponenteDigital {self.sha256[:12]}>"


class Assinatura(Base, TimestampMixin, TenantMixin):
    __tablename__ = "assinaturas"
    __table_args__ = (Index("ix_assinaturas_tenant_documento", "tenant_id", "documento_id"),)

    documento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    signatario_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    signatario_nome: Mapped[str] = mapped_column(String(255), nullable=False)
    papel_cargo: Mapped[Optional[str]] = mapped_column(
        String(150), nullable=True, comment="Papel/cargo no ato da assinatura (snapshot)"
    )
    nivel: Mapped[str] = mapped_column(
        String(20), default=NivelAssinatura.SIMPLES.value, nullable=False
    )
    algoritmo: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    hash_assinado: Mapped[str] = mapped_column(String(128), nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    certificado_serial: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    validacao_resultado: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True, comment="Resultado da validação no momento da assinatura"
    )
    assinatura_b64: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Artefato de assinatura qualificada (envelope base64: formato+CMS+carimbo)",
    )

    def __repr__(self) -> str:
        return f"<Assinatura {self.signatario_nome} {self.nivel}>"


class BlocoAssinatura(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "blocos_assinatura"

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    criado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return f"<BlocoAssinatura {self.nome}>"


class BlocoAssinaturaDocumento(Base, TimestampMixin, TenantMixin):
    __tablename__ = "bloco_assinatura_documentos"
    __table_args__ = (UniqueConstraint("bloco_id", "documento_id", name="uq_bloco_documento"),)

    bloco_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("blocos_assinatura.id", ondelete="CASCADE"),
        nullable=False,
    )
    documento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<BlocoAssinaturaDocumento bloco={self.bloco_id} doc={self.documento_id}>"
