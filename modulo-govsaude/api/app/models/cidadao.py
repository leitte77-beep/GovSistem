"""Cadastro único do cidadão, documentos, vínculos, deduplicação e unificação."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    BaixaMixin,
    Base,
    JSONType,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    VersaoMixin,
    VigenciaMixin,
)


class Cidadao(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    BaixaMixin,
    ActorMixin,
):
    __tablename__ = "cidadaos"
    __table_args__ = (
        Index("ix_cidadaos_tenant_nome_busca", "tenant_id", "nome_busca"),
        Index("ix_cidadaos_tenant_nome_fonetico", "tenant_id", "nome_fonetico"),
        Index("ix_cidadaos_tenant_nascimento", "tenant_id", "data_nascimento"),
        Index("ix_cidadaos_cpf_hash", "tenant_id", "cpf_hash"),
        Index("ix_cidadaos_cns_hash", "tenant_id", "cns_hash"),
        Index(
            "uq_cidadaos_cpf_hash_ativo",
            "tenant_id",
            "cpf_hash",
            unique=True,
            postgresql_where=text("cpf_hash IS NOT NULL AND baixa_em IS NULL"),
            sqlite_where=text("cpf_hash IS NOT NULL AND baixa_em IS NULL"),
        ),
        Index(
            "uq_cidadaos_cns_hash_ativo",
            "tenant_id",
            "cns_hash",
            unique=True,
            postgresql_where=text("cns_hash IS NOT NULL AND baixa_em IS NULL"),
            sqlite_where=text("cns_hash IS NOT NULL AND baixa_em IS NULL"),
        ),
        CheckConstraint(
            "sexo IN ('MASCULINO','FEMININO','INTERSEXO','NAO_INFORMADO','OUTRO')",
            name="ck_cidadaos_sexo",
        ),
    )

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    nome_social: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nome_busca: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nome_fonetico: Mapped[str | None] = mapped_column(String(200), nullable=True)

    cpf_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cpf_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    cpf_final: Mapped[str | None] = mapped_column(String(4), nullable=True)
    cns_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cns_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    cns_final: Mapped[str | None] = mapped_column(String(4), nullable=True)

    data_nascimento: Mapped[date | None] = mapped_column(Date, nullable=True)
    sexo: Mapped[str] = mapped_column(String(20), default="NAO_INFORMADO", nullable=False)
    identidade_genero: Mapped[str | None] = mapped_column(String(60), nullable=True)
    orientacao_sexual: Mapped[str | None] = mapped_column(String(60), nullable=True)
    raca_cor: Mapped[str | None] = mapped_column(String(40), nullable=True)
    etnia: Mapped[str | None] = mapped_column(String(80), nullable=True)
    nacionalidade: Mapped[str | None] = mapped_column(String(80), nullable=True)
    municipio_nascimento_ibge: Mapped[str | None] = mapped_column(String(7), nullable=True)
    ocupacao_cbo: Mapped[str | None] = mapped_column(String(6), nullable=True)
    escolaridade: Mapped[str | None] = mapped_column(String(80), nullable=True)
    situacao_rua: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    mae_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    nome_mae: Mapped[str | None] = mapped_column(String(200), nullable=True)
    mae_nome_busca: Mapped[str | None] = mapped_column(String(200), nullable=True)
    mae_nome_fonetico: Mapped[str | None] = mapped_column(String(200), nullable=True)

    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    unificado_para_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    unificado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CidadaoDocumento(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin
):
    __tablename__ = "cidadao_documentos"
    __table_args__ = (
        Index("ix_cidadao_documentos_tenant_cidadao", "tenant_id", "cidadao_id"),
        Index("ix_cidadao_documentos_numero", "tenant_id", "tipo", "numero_hash"),
        Index(
            "uq_cidadao_documentos_ativo",
            "tenant_id",
            "cidadao_id",
            "tipo",
            "numero_hash",
            unique=True,
            postgresql_where=text("baixa_em IS NULL"),
            sqlite_where=text("baixa_em IS NULL"),
        ),
        Index(
            "uq_cidadao_documentos_principal",
            "tenant_id",
            "cidadao_id",
            unique=True,
            postgresql_where=text("principal AND baixa_em IS NULL"),
            sqlite_where=text("principal AND baixa_em IS NULL"),
        ),
        CheckConstraint(
            "tipo IN ('CPF','CNS','RG','CNH','CERTIDAO_NASCIMENTO',"
            "'CERTIDAO_CASAMENTO','PASSAPORTE','OUTRO')",
            name="ck_cidadao_documentos_tipo",
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    numero_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    numero_cifrado: Mapped[str] = mapped_column(Text, nullable=False)
    numero_final: Mapped[str | None] = mapped_column(String(4), nullable=True)
    orgao_emissor: Mapped[str | None] = mapped_column(String(80), nullable=True)
    uf_emissor: Mapped[str | None] = mapped_column(String(2), nullable=True)
    data_emissao: Mapped[date | None] = mapped_column(Date, nullable=True)
    validade: Mapped[date | None] = mapped_column(Date, nullable=True)
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class CidadaoContato(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin
):
    __tablename__ = "cidadao_contatos"
    __table_args__ = (
        Index("ix_cidadao_contatos_tenant_cidadao", "tenant_id", "cidadao_id"),
        Index(
            "uq_cidadao_contatos_ativo",
            "tenant_id",
            "cidadao_id",
            "tipo",
            "valor_hash",
            unique=True,
            postgresql_where=text("baixa_em IS NULL"),
            sqlite_where=text("baixa_em IS NULL"),
        ),
        Index(
            "uq_cidadao_contatos_principal",
            "tenant_id",
            "cidadao_id",
            unique=True,
            postgresql_where=text("principal AND baixa_em IS NULL"),
            sqlite_where=text("principal AND baixa_em IS NULL"),
        ),
        CheckConstraint(
            "tipo IN ('TELEFONE','EMAIL','WHATSAPP','OUTRO')",
            name="ck_cidadao_contatos_tipo",
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    valor_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    valor_cifrado: Mapped[str] = mapped_column(Text, nullable=False)
    valor_final: Mapped[str | None] = mapped_column(String(20), nullable=True)
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class CidadaoEndereco(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin
):
    __tablename__ = "cidadao_enderecos"
    __table_args__ = (
        Index("ix_cidadao_enderecos_tenant_cidadao", "tenant_id", "cidadao_id"),
        Index("ix_cidadao_enderecos_ibge", "tenant_id", "municipio_ibge"),
        Index(
            "uq_cidadao_enderecos_principal",
            "tenant_id",
            "cidadao_id",
            unique=True,
            postgresql_where=text("principal AND baixa_em IS NULL"),
            sqlite_where=text("principal AND baixa_em IS NULL"),
        ),
        CheckConstraint(
            "tipo IN ('RESIDENCIAL','COMERCIAL','OUTRO')",
            name="ck_cidadao_enderecos_tipo",
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(30), default="RESIDENCIAL", nullable=False)
    cep: Mapped[str | None] = mapped_column(String(8), nullable=True)
    logradouro: Mapped[str | None] = mapped_column(String(240), nullable=True)
    numero: Mapped[str | None] = mapped_column(String(30), nullable=True)
    complemento: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bairro: Mapped[str | None] = mapped_column(String(120), nullable=True)
    municipio_ibge: Mapped[str | None] = mapped_column(String(7), nullable=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)
    pais: Mapped[str] = mapped_column(String(80), default="Brasil", nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(240), nullable=True)
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class CidadaoFoto(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin
):
    __tablename__ = "cidadao_fotos"
    __table_args__ = (
        Index("ix_cidadao_fotos_tenant_cidadao", "tenant_id", "cidadao_id"),
        UniqueConstraint("chave_objeto", name="uq_cidadao_fotos_chave"),
        Index(
            "uq_cidadao_fotos_principal",
            "tenant_id",
            "cidadao_id",
            unique=True,
            postgresql_where=text("principal AND baixa_em IS NULL"),
            sqlite_where=text("principal AND baixa_em IS NULL"),
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    chave_objeto: Mapped[str] = mapped_column(String(300), nullable=False)
    mime: Mapped[str] = mapped_column(String(120), nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status_antivirus: Mapped[str] = mapped_column(String(20), default="NAO_APLICAVEL", nullable=False)
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    criado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )


class PlanoSaudeVinculo(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
):
    __tablename__ = "planos_saude_vinculos"
    __table_args__ = (
        Index("ix_planos_saude_tenant_cidadao", "tenant_id", "cidadao_id"),
        Index("ix_planos_saude_carteira", "tenant_id", "numero_carteira_hash"),
        Index(
            "uq_planos_saude_principal",
            "tenant_id",
            "cidadao_id",
            unique=True,
            postgresql_where=text("principal AND baixa_em IS NULL"),
            sqlite_where=text("principal AND baixa_em IS NULL"),
        ),
        CheckConstraint(
            "tipo IN ('SAUDE_SUPLEMENTAR','PLANO_PRIVADO','OUTRO')",
            name="ck_planos_saude_tipo",
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    operadora: Mapped[str] = mapped_column(String(160), nullable=False)
    plano: Mapped[str | None] = mapped_column(String(160), nullable=True)
    tipo: Mapped[str] = mapped_column(String(30), default="SAUDE_SUPLEMENTAR", nullable=False)
    numero_carteira_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    numero_carteira_cifrado: Mapped[str | None] = mapped_column(Text, nullable=True)
    numero_carteira_final: Mapped[str | None] = mapped_column(String(4), nullable=True)
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class CidadaoAlergia(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin
):
    __tablename__ = "cidadao_alergias"
    __table_args__ = (
        Index("ix_cidadao_alergias_tenant_cidadao", "tenant_id", "cidadao_id"),
        Index("ix_cidadao_alergias_substancia", "tenant_id", "substancia_busca"),
        Index(
            "uq_cidadao_alergias_ativa",
            "tenant_id",
            "cidadao_id",
            "substancia_busca",
            unique=True,
            postgresql_where=text("baixa_em IS NULL"),
            sqlite_where=text("baixa_em IS NULL"),
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    substancia: Mapped[str] = mapped_column(String(200), nullable=False)
    substancia_busca: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tipo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    gravidade: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class CidadaoCondicao(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin
):
    __tablename__ = "cidadao_condicoes"
    __table_args__ = (
        Index("ix_cidadao_condicoes_tenant_cidadao", "tenant_id", "cidadao_id"),
        Index("ix_cidadao_condicoes_codigo", "tenant_id", "tipo_codigo", "codigo"),
        CheckConstraint(
            "tipo_codigo IN ('CID10','CIAP2','CIPE','OUTRO')",
            name="ck_cidadao_condicoes_tipo_codigo",
        ),
        CheckConstraint(
            "situacao IN ('ATIVA','RESOLVIDA')",
            name="ck_cidadao_condicoes_situacao",
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tipo_codigo: Mapped[str] = mapped_column(String(20), default="CID10", nullable=False)
    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String(300), nullable=True)
    data_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_fim: Mapped[date | None] = mapped_column(Date, nullable=True)
    situacao: Mapped[str] = mapped_column(String(20), default="ATIVA", nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class CidadaoDuplicidade(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin
):
    __tablename__ = "cidadao_duplicidades"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "cidadao_id", "candidato_id", name="uq_cidadao_duplicidades_par"
        ),
        Index(
            "ix_cidadao_duplicidades_tenant_status", "tenant_id", "status", "pontuacao"
        ),
        CheckConstraint(
            "status IN ('PENDENTE','MESMO','DIFERENTE','IGNORADO')",
            name="ck_cidadao_duplicidades_status",
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    candidato_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pontuacao: Mapped[int] = mapped_column(Integer, nullable=False)
    motivos: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDENTE", nullable=False)
    decisao_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    decisao_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)


class CidadaoUnificacao(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin
):
    __tablename__ = "cidadao_unificacoes"
    __table_args__ = (
        Index("ix_cidadao_unificacoes_tenant_origem", "tenant_id", "origem_id"),
        Index("ix_cidadao_unificacoes_tenant_destino", "tenant_id", "destino_id"),
        Index(
            "uq_cidadao_unificacao_ativa",
            "tenant_id",
            "origem_id",
            unique=True,
            postgresql_where=text("status = 'ATIVA'"),
            sqlite_where=text("status = 'ATIVA'"),
        ),
        CheckConstraint(
            "status IN ('ATIVA','REVERTIDA')", name="ck_cidadao_unificacoes_status"
        ),
    )

    origem_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    destino_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    campos_escolhidos: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    dados_antes_destino: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ATIVA", nullable=False)
    justificativa: Mapped[str] = mapped_column(Text, nullable=False)
    autor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    revertida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revertida_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    justificativa_reversao: Mapped[str | None] = mapped_column(Text, nullable=True)


class CidadaoBaixa(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "cidadao_baixas"
    __table_args__ = (
        Index("ix_cidadao_baixas_tenant_cidadao", "tenant_id", "cidadao_id"),
        CheckConstraint(
            "tipo IN ('BAIXA','REATIVACAO')", name="ck_cidadao_baixas_tipo"
        ),
    )

    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


__all__ = [
    "Cidadao",
    "CidadaoAlergia",
    "CidadaoBaixa",
    "CidadaoCondicao",
    "CidadaoContato",
    "CidadaoDocumento",
    "CidadaoDuplicidade",
    "CidadaoEndereco",
    "CidadaoFoto",
    "CidadaoUnificacao",
    "PlanoSaudeVinculo",
]
