"""Catálogos de domínio do GovPro: tipos de processo/documento, modelos,
textos padrão, plano de classificação arquivística e hipóteses legais de sigilo.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, SoftDeleteMixin, TenantMixin, TimestampMixin
from app.models.enums import NivelAssinatura


class TipoProcesso(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "tipos_processo"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_tipo_processo_tenant_codigo"),
    )

    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    publico_externo: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Permite peticionamento pelo cidadão (Fase 3)",
    )
    niveis_permitidos: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        comment="Níveis de acesso permitidos para este tipo (ex.: ['PUBLICO','RESTRITO'])",
    )
    classificacao_padrao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plano_classificacao.id", ondelete="SET NULL"),
        nullable=True,
    )
    unidade_destino_padrao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="SET NULL"),
        nullable=True,
        comment="Unidade de destino padrão no roteamento (Fase 3)",
    )
    prazo_legal_dias: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    base_legal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<TipoProcesso {self.codigo}>"


class TipoDocumento(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "tipos_documento"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_tipo_documento_tenant_codigo"),
    )

    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    nivel_assinatura_minimo: Mapped[str] = mapped_column(
        String(20),
        default=NivelAssinatura.SIMPLES.value,
        nullable=False,
        comment="Nível mínimo de assinatura exigido (Lei 14.063/2020)",
    )
    numeracao: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Gera numeração automática por tipo/unidade/ano",
    )
    modelo_padrao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        comment="Modelo padrão (referência lógica; sem FK para evitar ciclo com modelos_documento)",
    )
    # ── Matriz de assinatura (por tipo de ato/documento) ──────────────────────
    # Complementa o `nivel_assinatura_minimo`: define QUEM pode assinar, quantos,
    # a ordem, a necessidade de assinatura externa e se aceita assinatura em bloco.
    perfis_autorizados: Mapped[Optional[list]] = mapped_column(
        JSON,
        nullable=True,
        comment="Perfis autorizados a assinar (vazio/null = qualquer perfil atuante)",
    )
    qtd_assinaturas_minima: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="Quantidade mínima de assinaturas exigidas no ato",
    )
    assinatura_sequencial: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Assinatura em cadeia (uma após a outra), senão paralela",
    )
    exige_assinatura_externa: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="Exige assinatura de usuário/representante externo",
    )
    permite_bloco: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="Permite assinatura em bloco (lote)",
    )
    fundamento_normativo: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Fundamento normativo da exigência de assinatura",
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<TipoDocumento {self.codigo}>"


class ModeloDocumento(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "modelos_documento"

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo_documento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tipos_documento.id", ondelete="SET NULL"),
        nullable=True,
    )
    conteudo_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<ModeloDocumento {self.nome}>"


class TextoPadrao(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    __tablename__ = "textos_padrao"

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    conteudo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<TextoPadrao {self.nome}>"


class PlanoClassificacao(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Plano de classificação arquivística (classe/subclasse/grupo/subgrupo)."""

    __tablename__ = "plano_classificacao"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_classe_tenant_codigo"),
        Index("ix_classe_tenant_pai", "tenant_id", "classe_pai_id"),
    )

    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    classe_pai_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plano_classificacao.id", ondelete="SET NULL"),
        nullable=True,
    )
    vigencia_inicio: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    vigencia_fim: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Classe {self.codigo} {self.descricao}>"


class HipoteseLegal(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Hipóteses legais de restrição de acesso (LAI art. 23/31; sigilos legais)."""

    __tablename__ = "hipoteses_legais"
    __table_args__ = (UniqueConstraint("tenant_id", "codigo", name="uq_hipotese_tenant_codigo"),)

    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    base_legal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    grau_sigilo: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Grau (RESERVADO/SECRETO/ULTRASSECRETO) quando aplicável",
    )
    prazo_sigilo_anos: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<HipoteseLegal {self.codigo}>"
