"""Rede de atenção, cadastros-base, escalas e importação CNES (Fase 1).

Estas tabelas complementam as entidades de fundação em ``models/nucleo.py``.
Nenhuma delas substitui ``estabelecimentos``, ``setores``, ``equipes``,
``profissionais`` ou ``vinculos_profissionais``: a Fase 1 apenas estende o
núcleo existente e cria as tabelas que faltavam.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time

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
    Time,
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


class ServicoClassificacao(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, BaixaMixin, VersaoMixin
):
    """Serviço ou classificação habilitado em um estabelecimento.

    Não há cópia de tabela oficial aqui: o nome/descrição é configuração do
    tenant. Códigos oficiais (quando existirem) entram por importação e são
    referenciados, nunca inventados.
    """

    __tablename__ = "servicos_classificacoes"
    __table_args__ = (
        Index(
            "ix_servicos_classificacoes_tenant_estab",
            "tenant_id",
            "estabelecimento_id",
            "tipo",
        ),
        Index(
            "uq_servicos_classificacoes_ativos",
            "tenant_id",
            "estabelecimento_id",
            "tipo",
            "codigo",
            unique=True,
            postgresql_where=text("baixa_em IS NULL"),
            sqlite_where=text("baixa_em IS NULL"),
        ),
        CheckConstraint(
            "tipo IN ('SERVICO','CLASSIFICACAO')",
            name="ck_servicos_classificacoes_tipo",
        ),
    )

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ProcedimentoAutorizado(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
):
    """Procedimento SIGTAP autorizado por estabelecimento/profissional/especialidade.

    O código SIGTAP é validado estruturalmente e, quando a competência oficial
    estiver importada, contra ``referencia.sigtap_procedimentos``. O sistema
    nunca cria descrição ou compatibilidade para um código ausente.
    """

    __tablename__ = "procedimentos_autorizados"
    __table_args__ = (
        Index(
            "ix_procedimentos_autorizados_tenant_estab",
            "tenant_id",
            "estabelecimento_id",
            "codigo_sigtap",
        ),
        Index(
            "ix_procedimentos_autorizados_tenant_prof",
            "tenant_id",
            "profissional_id",
            "codigo_sigtap",
        ),
    )

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    profissional_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True, index=True
    )
    especialidade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("especialidades.id", ondelete="SET NULL"), nullable=True, index=True
    )
    codigo_sigtap: Mapped[str] = mapped_column(String(10), nullable=False)
    competencia: Mapped[str | None] = mapped_column(String(6), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    validado_referencia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aviso_referencia: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class HorarioFuncionamento(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
):
    __tablename__ = "horarios_funcionamento"
    __table_args__ = (
        Index(
            "ix_horarios_funcionamento_tenant_estab",
            "tenant_id",
            "estabelecimento_id",
            "dia_semana",
        ),
        CheckConstraint(
            "dia_semana BETWEEN 0 AND 6", name="ck_horarios_funcionamento_dia"
        ),
        CheckConstraint(
            "hora_inicio < hora_fim", name="ck_horarios_funcionamento_intervalo"
        ),
    )

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("setores.id", ondelete="SET NULL"), nullable=True, index=True
    )
    dia_semana: Mapped[int] = mapped_column(Integer, nullable=False)
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fim: Mapped[time] = mapped_column(Time, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class _TurnoBase(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    BaixaMixin,
):
    """Campos comuns de escala e plantão. As tabelas são independentes."""

    __abstract__ = True

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("setores.id", ondelete="SET NULL"), nullable=True, index=True
    )
    equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("equipes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    profissional_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True, index=True
    )
    data: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fim: Mapped[time] = mapped_column(Time, nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    situacao: Mapped[str] = mapped_column(String(20), default="ATIVA", nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    justificativa_excecao: Mapped[str | None] = mapped_column(Text, nullable=True)
    autorizado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    autorizado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Escala(_TurnoBase):
    __tablename__ = "escalas"
    __table_args__ = (
        Index("ix_escalas_tenant_estab_data", "tenant_id", "estabelecimento_id", "data"),
        Index("ix_escalas_tenant_prof_data", "tenant_id", "profissional_id", "data"),
        Index("ix_escalas_tenant_equipe_data", "tenant_id", "equipe_id", "data"),
        CheckConstraint(
            "tipo IN ('REGULAR','EXTRA','SOBREAVISO')", name="ck_escalas_tipo"
        ),
        CheckConstraint(
            "situacao IN ('ATIVA','CANCELADA','CONCLUIDA')", name="ck_escalas_situacao"
        ),
        CheckConstraint(
            "profissional_id IS NOT NULL OR equipe_id IS NOT NULL",
            name="ck_escalas_responsavel",
        ),
    )


class Plantao(_TurnoBase):
    __tablename__ = "plantoes"
    __table_args__ = (
        Index("ix_plantoes_tenant_estab_data", "tenant_id", "estabelecimento_id", "data"),
        Index("ix_plantoes_tenant_prof_data", "tenant_id", "profissional_id", "data"),
        Index("ix_plantoes_tenant_equipe_data", "tenant_id", "equipe_id", "data"),
        CheckConstraint(
            "tipo IN ('PRESENCIAL','SOBREAVISO')", name="ck_plantoes_tipo"
        ),
        CheckConstraint(
            "situacao IN ('ATIVA','CANCELADA','CONCLUIDA')", name="ck_plantoes_situacao"
        ),
        CheckConstraint(
            "profissional_id IS NOT NULL OR equipe_id IS NOT NULL",
            name="ck_plantoes_responsavel",
        ),
    )


class Prioridade(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
):
    """Prioridade legal/clínica configurável por tenant.

    O motor lê esta tabela; nenhuma ordem, rótulo ou marcação legal é fixada no
    Python. ``base_legal`` é obrigatória quando ``prioridade_legal`` é verdadeira.
    """

    __tablename__ = "prioridades"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "codigo", "vigencia_inicio", name="uq_prioridades_codigo_vigencia"
        ),
        Index("ix_prioridades_tenant_ordem", "tenant_id", "ordem"),
        CheckConstraint("ordem >= 0", name="ck_prioridades_ordem"),
    )

    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    rotulo: Mapped[str] = mapped_column(String(120), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    prioridade_legal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    base_legal: Mapped[str | None] = mapped_column(String(240), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class RestricaoHorarioAcesso(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
):
    """Restrição de horário complementar à janela do usuário.

    A restrição pode ser individual (``usuario_id``), por grupo
    (``grupo_id``) e/ou por estabelecimento. Sem ``estabelecimento_id`` vale
    para o login (contexto ainda sem unidade); com unidade, vale para operações
    naquela unidade.
    """

    __tablename__ = "restricoes_horario_acesso"
    __table_args__ = (
        Index("ix_restricoes_horario_usuario", "tenant_id", "usuario_id"),
        Index("ix_restricoes_horario_grupo", "tenant_id", "grupo_id"),
        CheckConstraint(
            "usuario_id IS NOT NULL OR grupo_id IS NOT NULL",
            name="ck_restricoes_horario_alvo",
        ),
        CheckConstraint(
            "hora_inicio <> hora_fim", name="ck_restricoes_horario_intervalo"
        ),
    )

    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=True, index=True
    )
    grupo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("grupos.id", ondelete="CASCADE"), nullable=True, index=True
    )
    estabelecimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="CASCADE"), nullable=True, index=True
    )
    dias_semana: Mapped[list[int]] = mapped_column(
        JSONType, default=lambda: [0, 1, 2, 3, 4, 5, 6], nullable=False
    )
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fim: Mapped[time] = mapped_column(Time, nullable=False)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ProfissionalEspecialidade(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VigenciaMixin, VersaoMixin
):
    __tablename__ = "profissionais_especialidades"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "profissional_id",
            "especialidade_id",
            "vigencia_inicio",
            name="uq_profissionais_especialidades",
        ),
        Index(
            "ix_profissionais_especialidades_tenant_prof",
            "tenant_id",
            "profissional_id",
        ),
    )

    profissional_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    especialidade_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("especialidades.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ImportacaoCNES(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin
):
    """Execução da importação CNES com relatório de inconsistências.

    ``arquivo_nome`` é o nome técnico do artefato oficial; nunca contém CPF,
    CNS ou nome de pessoa. O relatório guarda valores mascarados quando o campo
    é sensível.
    """

    __tablename__ = "importacoes_cnes"
    __table_args__ = (
        Index("ix_importacoes_cnes_tenant_status", "tenant_id", "status", "created_at"),
        Index("ix_importacoes_cnes_hash", "tenant_id", "hash_arquivo"),
    )

    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("jobs.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    arquivo_nome: Mapped[str | None] = mapped_column(String(240), nullable=True)
    hash_arquivo: Mapped[str | None] = mapped_column(String(64), nullable=True)
    versao_layout: Mapped[str | None] = mapped_column(String(80), nullable=True)
    competencia: Mapped[str | None] = mapped_column(String(6), nullable=True)
    total_linhas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_validos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_rejeitados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_criados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_atualizados: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conferencia_ok: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    relatorio: Mapped[dict] = mapped_column(JSONType, nullable=False)


__all__ = [
    "Escala",
    "HorarioFuncionamento",
    "ImportacaoCNES",
    "Plantao",
    "Prioridade",
    "ProcedimentoAutorizado",
    "ProfissionalEspecialidade",
    "RestricaoHorarioAcesso",
    "ServicoClassificacao",
]
