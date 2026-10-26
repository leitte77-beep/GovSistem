"""Programas, linhas de cuidado, inscrições, programação e busca ativa (Fase 6).

Requisitos atendidos: B.2-001…015. O motor é genérico: critérios de
elegibilidade, itens previstos, periodicidade e formulário dinâmico são dados
versionados do tenant. Nenhuma regra clínica oficial (intervalo, faixa etária,
esquema de fornecimento) é fixada em código; os seeds nacionais entram como
``SEED_A_VALIDAR`` e dependem da importação/validação do protocolo oficial.
"""

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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.encryption import CampoProtegido
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
from app.models.cidadao import Cidadao
from app.models.enums import (
    MotivoBuscaAtiva,
    OrigemPrograma,
    SituacaoBuscaAtiva,
    SituacaoInscricaoPrograma,
    SituacaoProgramacao,
    TipoItemPrograma,
    TipoPrograma,
)


class Programa(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
    ActorMixin,
):
    """Programa ou linha de cuidado parametrizável, com versão por vigência."""

    __tablename__ = "programas"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "codigo", "versao_programa", name="uq_programas_codigo_versao"
        ),
        Index("ix_programas_tenant_ativo", "tenant_id", "ativo", "vigencia_inicio"),
        Index("ix_programas_tenant_linha", "tenant_id", "linha_cuidado"),
        CheckConstraint(
            "tipo IN ('PROGRAMA','LINHA_CUIDADO')", name="ck_programas_tipo"
        ),
        CheckConstraint(
            "origem IN ('TENANT','SEED_A_VALIDAR')", name="ck_programas_origem"
        ),
        CheckConstraint(
            "periodicidade_padrao_dias IS NULL OR periodicidade_padrao_dias > 0",
            name="ck_programas_periodicidade",
        ),
    )

    codigo: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(
        String(30), default=TipoPrograma.PROGRAMA.value, nullable=False
    )
    linha_cuidado: Mapped[str | None] = mapped_column(String(80), nullable=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    criterios_elegibilidade: Mapped[dict] = mapped_column(
        JSONType, default=dict, nullable=False
    )
    periodicidade_padrao_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    formulario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("formularios_dinamicos.id", ondelete="SET NULL"), nullable=True
    )
    marcador_gestante: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    base_normativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    fonte: Mapped[str | None] = mapped_column(String(300), nullable=True)
    origem: Mapped[str] = mapped_column(
        String(20), default=OrigemPrograma.TENANT.value, nullable=False
    )
    versao_programa: Mapped[str] = mapped_column(String(40), default="1", nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    itens: Mapped[list["ProgramaItem"]] = relationship(
        back_populates="programa",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ProgramaItem.ordem, ProgramaItem.created_at",
    )


class ProgramaItem(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    BaixaMixin,
    ActorMixin,
):
    """Item previsto no programa (consulta, exame, fornecimento, vacina...)."""

    __tablename__ = "programa_itens"
    __table_args__ = (
        Index("ix_programa_itens_tenant_programa", "tenant_id", "programa_id", "ativo"),
        Index(
            "ix_programa_itens_busca",
            "tenant_id",
            "programa_id",
            "tipo",
            "codigo",
        ),
        CheckConstraint(
            "tipo IN ('CONSULTA','EXAME','FORNECIMENTO','VACINA','PROCEDIMENTO','ORIENTACAO')",
            name="ck_programa_itens_tipo",
        ),
        CheckConstraint(
            "periodicidade_dias IS NULL OR periodicidade_dias > 0",
            name="ck_programa_itens_periodicidade",
        ),
        CheckConstraint(
            "idade_min_meses IS NULL OR idade_min_meses >= 0",
            name="ck_programa_itens_idade_min",
        ),
        CheckConstraint(
            "idade_max_meses IS NULL OR idade_max_meses >= 0",
            name="ck_programa_itens_idade_max",
        ),
        CheckConstraint(
            "idade_min_meses IS NULL OR idade_max_meses IS NULL "
            "OR idade_min_meses <= idade_max_meses",
            name="ck_programa_itens_idade_intervalo",
        ),
        CheckConstraint("quantidade >= 1", name="ck_programa_itens_quantidade"),
    )

    programa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("programas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(
        String(30), default=TipoItemPrograma.CONSULTA.value, nullable=False
    )
    codigo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    periodicidade_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    idade_min_meses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    idade_max_meses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sexo: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gestante: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    obrigatorio: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    quantidade: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unidade: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    programa: Mapped[Programa] = relationship(back_populates="itens")


class ProgramaInscricao(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    ActorMixin,
):
    """Inscrição do cidadão em um programa, com situação e histórico de saída."""

    __tablename__ = "programa_inscricoes"
    __table_args__ = (
        Index(
            "ix_programa_inscricoes_tenant_programa",
            "tenant_id",
            "programa_id",
            "situacao",
        ),
        Index(
            "ix_programa_inscricoes_tenant_cidadao",
            "tenant_id",
            "cidadao_id",
            "data_entrada",
        ),
        Index(
            "ix_programa_inscricoes_tenant_estab",
            "tenant_id",
            "estabelecimento_id",
            "situacao",
        ),
        Index(
            "uq_programa_inscricao_vigente",
            "tenant_id",
            "programa_id",
            "cidadao_id",
            unique=True,
            postgresql_where=text("situacao IN ('ATIVA','SUSPENSA')"),
            sqlite_where=text("situacao IN ('ATIVA','SUSPENSA')"),
        ),
        CheckConstraint(
            "situacao IN ('ATIVA','SUSPENSA','ENCERRADA','TRANSFERIDA')",
            name="ck_programa_inscricoes_situacao",
        ),
        CheckConstraint(
            "data_saida IS NULL OR data_saida >= data_entrada",
            name="ck_programa_inscricoes_datas",
        ),
    )

    programa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("programas.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("equipes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    profissional_responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("profissionais.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoInscricaoPrograma.ATIVA.value, nullable=False
    )
    motivo_saida: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_entrada: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    data_saida: Mapped[date | None] = mapped_column(Date, nullable=True)
    gestante: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    dados_clinicos: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    observacoes_cifradas: Mapped[str | None] = mapped_column(
        CampoProtegido, nullable=True
    )
    excecao_justificada: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    justificativa_excecao: Mapped[str | None] = mapped_column(Text, nullable=True)

    programa: Mapped[Programa] = relationship(lazy="selectin")
    cidadao: Mapped[Cidadao] = relationship(lazy="selectin")


class ProgramaProgramacao(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    ActorMixin,
):
    """Ação prevista × realizada de uma inscrição (consulta, exame, fornecimento)."""

    __tablename__ = "programa_programacoes"
    __table_args__ = (
        Index(
            "ix_programa_programacoes_tenant_inscricao",
            "tenant_id",
            "inscricao_id",
            "previsto_para",
        ),
        Index(
            "ix_programa_programacoes_tenant_situacao",
            "tenant_id",
            "situacao",
            "previsto_para",
        ),
        Index(
            "uq_programa_programacao_prevista",
            "tenant_id",
            "inscricao_id",
            "item_id",
            "previsto_para",
            unique=True,
            postgresql_where=text("situacao IN ('PREVISTO','REMARCADO')"),
            sqlite_where=text("situacao IN ('PREVISTO','REMARCADO')"),
        ),
        CheckConstraint(
            "situacao IN ('PREVISTO','REALIZADO','REMARCADO','PERDIDO','CANCELADO')",
            name="ck_programa_programacoes_situacao",
        ),
        CheckConstraint("quantidade >= 1", name="ck_programa_programacoes_quantidade"),
    )

    inscricao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("programa_inscricoes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("programa_itens.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    previsto_para: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    realizado_em: Mapped[date | None] = mapped_column(Date, nullable=True)
    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoProgramacao.PREVISTO.value, nullable=False
    )
    quantidade: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    atendimento_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    observacoes_cifradas: Mapped[str | None] = mapped_column(
        CampoProtegido, nullable=True
    )
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    remarcado_de_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("programa_programacoes.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )

    inscricao: Mapped[ProgramaInscricao] = relationship(lazy="selectin")
    item: Mapped[ProgramaItem] = relationship(lazy="selectin")


class ProgramaBuscaAtiva(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    ActorMixin,
):
    """Tentativa de busca ativa para recuperar uma ação programática pendente."""

    __tablename__ = "programa_buscas_ativas"
    __table_args__ = (
        Index(
            "ix_programa_buscas_tenant_inscricao",
            "tenant_id",
            "inscricao_id",
            "created_at",
        ),
        Index(
            "ix_programa_buscas_tenant_situacao",
            "tenant_id",
            "situacao",
            "proxima_tentativa_em",
        ),
        CheckConstraint(
            "motivo IN ('ATRASO','FALTA','EXAME_PENDENTE','FORNECIMENTO_PENDENTE','OUTRO')",
            name="ck_programa_buscas_motivo",
        ),
        CheckConstraint(
            "situacao IN ('PENDENTE','CONTATADO','RECUPERADO','SEM_SUCESSO','TRANSFERIDO')",
            name="ck_programa_buscas_situacao",
        ),
        CheckConstraint("tentativa >= 1", name="ck_programa_buscas_tentativa"),
    )

    inscricao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("programa_inscricoes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    programacao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("programa_programacoes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    motivo: Mapped[str] = mapped_column(
        String(30), default=MotivoBuscaAtiva.ATRASO.value, nullable=False
    )
    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoBuscaAtiva.PENDENTE.value, nullable=False
    )
    tentativa: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    contato_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    proxima_tentativa_em: Mapped[date | None] = mapped_column(Date, nullable=True)
    desfecho: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacoes_cifradas: Mapped[str | None] = mapped_column(
        CampoProtegido, nullable=True
    )
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )

    inscricao: Mapped[ProgramaInscricao] = relationship(lazy="selectin")
    programacao: Mapped[ProgramaProgramacao | None] = relationship(lazy="selectin")


__all__ = [
    "Programa",
    "ProgramaBuscaAtiva",
    "ProgramaInscricao",
    "ProgramaItem",
    "ProgramaProgramacao",
]
