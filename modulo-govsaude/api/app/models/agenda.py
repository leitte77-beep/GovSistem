"""Agenda, recepção, fila e painéis de chamada (Fase 4).

Requisitos atendidos: B.6-001, B.6-002, B.6-003, B.6-005, B.6-007,
B.6-008, B.6-012, B.6-045, B.6-046, B.6-047, B.3-008 e B.12-018.

As regras de negócio ficam nos serviços; estas tabelas apenas modelam o
domínio. Nenhum protocolo de classificação de risco, cor, tempo-alvo ou
prioridade legal é fixado no código: todos são dados versionados do tenant.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    false,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
from app.models.rede import Prioridade


class ProtocoloClassificacaoRisco(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
):
    __tablename__ = "protocolos_classificacao_risco"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "estabelecimento_id",
            "nome",
            "versao_protocolo",
            name="uq_protocolo_risco_versao",
        ),
        Index(
            "ix_protocolos_risco_tenant_estab",
            "tenant_id",
            "estabelecimento_id",
            "ativo",
        ),
    )

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    versao_protocolo: Mapped[str] = mapped_column(String(40), default="1", nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    niveis: Mapped[list["NivelClassificacaoRisco"]] = relationship(
        back_populates="protocolo",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="NivelClassificacaoRisco.ordem",
    )


class NivelClassificacaoRisco(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin
):
    __tablename__ = "niveis_classificacao_risco"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "protocolo_id",
            "codigo",
            name="uq_nivel_risco_codigo",
        ),
        Index("ix_niveis_risco_tenant_protocolo", "tenant_id", "protocolo_id", "ordem"),
        CheckConstraint("ordem >= 0", name="ck_niveis_risco_ordem"),
        CheckConstraint(
            "tempo_alvo_minutos IS NULL OR tempo_alvo_minutos >= 0",
            name="ck_niveis_risco_tempo",
        ),
    )

    protocolo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("protocolos_classificacao_risco.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    rotulo: Mapped[str] = mapped_column(String(120), nullable=False)
    cor: Mapped[str] = mapped_column(String(9), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    prioridade_legal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tempo_alvo_minutos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    protocolo: Mapped[ProtocoloClassificacaoRisco] = relationship(back_populates="niveis")


class Agenda(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
    ActorMixin,
):
    __tablename__ = "agendas"
    __table_args__ = (
        Index(
            "ix_agendas_tenant_estab",
            "tenant_id",
            "estabelecimento_id",
            "ativo",
        ),
        Index(
            "ix_agendas_tenant_prof",
            "tenant_id",
            "profissional_id",
            "ativo",
        ),
        CheckConstraint(
            "tipo IN ('CONSULTA','PROCEDIMENTO','RETORNO','ODONTOLOGIA',"
            "'VACINACAO','ACOLHIMENTO','OUTRO')",
            name="ck_agendas_tipo",
        ),
        CheckConstraint(
            "idade_minima IS NULL OR idade_minima >= 0",
            name="ck_agendas_idade_minima",
        ),
        CheckConstraint(
            "idade_maxima IS NULL OR idade_maxima >= 0",
            name="ck_agendas_idade_maxima",
        ),
        CheckConstraint(
            "idade_minima IS NULL OR idade_maxima IS NULL OR idade_minima <= idade_maxima",
            name="ck_agendas_idade_intervalo",
        ),
        CheckConstraint(
            "antecedencia_minima_horas >= 0 AND antecedencia_maxima_dias >= 0",
            name="ck_agendas_antecedencia",
        ),
        CheckConstraint(
            "tolerancia_atraso_minutos >= 0",
            name="ck_agendas_tolerancia",
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
    equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("equipes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    profissional_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True, index=True
    )
    especialidade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("especialidades.id", ondelete="SET NULL"), nullable=True, index=True
    )
    protocolo_risco_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("protocolos_classificacao_risco.id", ondelete="SET NULL"),
        nullable=True,
    )
    prioridade_padrao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("prioridades.id", ondelete="SET NULL"), nullable=True
    )
    procedimento_sigtap: Mapped[str | None] = mapped_column(String(10), nullable=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    modalidade: Mapped[str] = mapped_column(
        String(30), default="PRESENCIAL", nullable=False
    )
    permite_encaixe: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    falta_automatica: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    tolerancia_atraso_minutos: Mapped[int] = mapped_column(
        Integer, default=30, nullable=False
    )
    antecedencia_minima_horas: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    antecedencia_maxima_dias: Mapped[int] = mapped_column(
        Integer, default=365, nullable=False
    )
    idade_minima: Mapped[int | None] = mapped_column(Integer, nullable=True)
    idade_maxima: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sexos_permitidos: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    horarios: Mapped[list["AgendaHorario"]] = relationship(
        back_populates="agenda",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="AgendaHorario.dia_semana, AgendaHorario.hora_inicio",
    )


class AgendaHorario(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "agenda_horarios"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "agenda_id",
            "dia_semana",
            "hora_inicio",
            name="uq_agenda_horario_inicio",
        ),
        Index("ix_agenda_horarios_tenant_agenda", "tenant_id", "agenda_id"),
        CheckConstraint("dia_semana BETWEEN 0 AND 6", name="ck_agenda_horario_dia"),
        CheckConstraint("hora_inicio < hora_fim", name="ck_agenda_horario_intervalo"),
        CheckConstraint(
            "duracao_minutos BETWEEN 5 AND 480", name="ck_agenda_horario_duracao"
        ),
        CheckConstraint("vagas_por_horario >= 1", name="ck_agenda_horario_vagas"),
    )

    agenda_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("agendas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dia_semana: Mapped[int] = mapped_column(Integer, nullable=False)
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fim: Mapped[time] = mapped_column(Time, nullable=False)
    duracao_minutos: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    vagas_por_horario: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    agenda: Mapped[Agenda] = relationship(back_populates="horarios")


class AgendaBloqueio(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin
):
    __tablename__ = "agenda_bloqueios"
    __table_args__ = (
        Index(
            "ix_agenda_bloqueios_tenant_agenda",
            "tenant_id",
            "agenda_id",
            "inicio_em",
            "fim_em",
        ),
        CheckConstraint("inicio_em < fim_em", name="ck_agenda_bloqueio_intervalo"),
        CheckConstraint(
            "tipo IN ('BLOQUEIO','FERIADO','MANUTENCAO','AUSENCIA','OUTRO')",
            name="ck_agenda_bloqueio_tipo",
        ),
    )

    agenda_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("agendas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inicio_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), default="BLOQUEIO", nullable=False)
    motivo: Mapped[str] = mapped_column(String(400), nullable=False)
    criado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    cancelado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelado_motivo: Mapped[str | None] = mapped_column(String(400), nullable=True)
    cancelado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )


class Agendamento(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    ActorMixin,
):
    __tablename__ = "agendamentos"
    __table_args__ = (
        Index(
            "ix_agendamentos_tenant_agenda_inicio",
            "tenant_id",
            "agenda_id",
            "inicio_em",
        ),
        Index(
            "ix_agendamentos_tenant_estab_inicio",
            "tenant_id",
            "estabelecimento_id",
            "inicio_em",
        ),
        Index(
            "ix_agendamentos_tenant_cidadao",
            "tenant_id",
            "cidadao_id",
            "inicio_em",
        ),
        Index(
            "ix_agendamentos_tenant_situacao",
            "tenant_id",
            "situacao",
            "inicio_em",
        ),
        Index(
            "uq_agendamentos_cidadao_horario_ativo",
            "tenant_id",
            "cidadao_id",
            "inicio_em",
            unique=True,
            postgresql_where=text(
                "situacao NOT IN ('CANCELADO','FALTOU','VENCIDO','REAGENDADO')"
            ),
            sqlite_where=text(
                "situacao NOT IN ('CANCELADO','FALTOU','VENCIDO','REAGENDADO')"
            ),
        ),
        Index(
            "uq_agendamentos_id_cliente",
            "tenant_id",
            "id_cliente",
            unique=True,
            postgresql_where=text("id_cliente IS NOT NULL"),
            sqlite_where=text("id_cliente IS NOT NULL"),
        ),
        CheckConstraint("inicio_em < fim_em", name="ck_agendamentos_intervalo"),
        CheckConstraint(
            "situacao IN ('AGENDADO','CONFIRMADO','AGUARDANDO','EM_ATENDIMENTO',"
            "'ATENDIDO','CANCELADO','FALTOU','VENCIDO','REAGENDADO')",
            name="ck_agendamentos_situacao",
        ),
        CheckConstraint(
            "origem IN ('RECEPCAO','APP','WEB','TELEFONE','PRESENCIAL',"
            "'IMPORTACAO','OUTRO')",
            name="ck_agendamentos_origem",
        ),
    )

    agenda_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("agendas.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("setores.id", ondelete="SET NULL"), nullable=True
    )
    profissional_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True, index=True
    )
    especialidade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("especialidades.id", ondelete="SET NULL"), nullable=True
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    prioridade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("prioridades.id", ondelete="SET NULL"), nullable=True
    )
    protocolo_risco_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("protocolos_classificacao_risco.id", ondelete="SET NULL"),
        nullable=True,
    )
    nivel_risco_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("niveis_classificacao_risco.id", ondelete="SET NULL"),
        nullable=True,
    )
    procedimento_sigtap: Mapped[str | None] = mapped_column(String(10), nullable=True)
    inicio_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    fim_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    situacao: Mapped[str] = mapped_column(
        String(20), default="AGENDADO", nullable=False
    )
    origem: Mapped[str] = mapped_column(
        String(20), default="RECEPCAO", nullable=False
    )
    encaixe: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default=false())
    excecao_justificada: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default=false()
    )
    justificativa_excecao: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    codigo_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    id_cliente: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    confirmado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    recepcionado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    iniciado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    concluido_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    motivo_cancelamento: Mapped[str | None] = mapped_column(String(400), nullable=True)
    falta_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    falta_automatica: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default=false()
    )
    falta_revertida_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    falta_revertida_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    justificativa_reversao: Mapped[str | None] = mapped_column(Text, nullable=True)
    reagendado_de_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("agendamentos.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )

    agenda: Mapped[Agenda] = relationship(lazy="selectin")
    cidadao: Mapped[Cidadao] = relationship(lazy="selectin")


class FilaAtendimento(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    ActorMixin,
):
    __tablename__ = "filas_atendimento"
    __table_args__ = (
        Index(
            "ix_filas_tenant_estab_setor",
            "tenant_id",
            "estabelecimento_id",
            "setor_id",
            "situacao",
        ),
        Index(
            "ix_filas_tenant_cidadao",
            "tenant_id",
            "cidadao_id",
            "situacao",
        ),
        Index(
            "uq_filas_agendamento_ativo",
            "tenant_id",
            "agendamento_id",
            unique=True,
            postgresql_where=text(
                "agendamento_id IS NOT NULL AND situacao NOT IN "
                "('ATENDIDO','EVADIDO','CANCELADO')"
            ),
            sqlite_where=text(
                "agendamento_id IS NOT NULL AND situacao NOT IN "
                "('ATENDIDO','EVADIDO','CANCELADO')"
            ),
        ),
        CheckConstraint(
            "situacao IN ('AGUARDANDO','CHAMADO','EM_TRIAGEM',"
            "'AGUARDANDO_ATENDIMENTO','EM_ATENDIMENTO','ATENDIDO',"
            "'EVADIDO','CANCELADO')",
            name="ck_filas_situacao",
        ),
        CheckConstraint(
            "origem IN ('AGENDAMENTO','DEMANDA_ESPONTANEA','RETORNO','ENCAIXE')",
            name="ck_filas_origem",
        ),
    )

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    setor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("setores.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    agendamento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("agendamentos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    prioridade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("prioridades.id", ondelete="SET NULL"), nullable=True
    )
    protocolo_risco_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("protocolos_classificacao_risco.id", ondelete="SET NULL"),
        nullable=True,
    )
    nivel_risco_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("niveis_classificacao_risco.id", ondelete="SET NULL"),
        nullable=True,
    )
    origem: Mapped[str] = mapped_column(
        String(30), default="DEMANDA_ESPONTANEA", nullable=False
    )
    situacao: Mapped[str] = mapped_column(
        String(30), default="AGUARDANDO", nullable=False
    )
    entrada_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    chamado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ultima_chamada_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    chamadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    triagem_inicio_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    triagem_fim_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    atendimento_inicio_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    atendimento_fim_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    evadido_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    nome_abreviado: Mapped[str] = mapped_column(String(120), nullable=False)
    nivel_ordem: Mapped[int] = mapped_column(Integer, default=999, nullable=False)
    prioridade_ordem: Mapped[int] = mapped_column(Integer, default=999, nullable=False)
    prioridade_legal: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default=false()
    )
    regra_ordenacao: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    cidadao: Mapped[Cidadao] = relationship(lazy="selectin")
    agendamento: Mapped[Agendamento | None] = relationship(lazy="selectin")
    prioridade: Mapped[Prioridade | None] = relationship("Prioridade", lazy="selectin")
    nivel_risco: Mapped[NivelClassificacaoRisco | None] = relationship(
        "NivelClassificacaoRisco", lazy="selectin"
    )
    protocolo_risco: Mapped[ProtocoloClassificacaoRisco | None] = relationship(
        "ProtocoloClassificacaoRisco", lazy="selectin"
    )


class EventoFila(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "eventos_fila"
    __table_args__ = (
        Index(
            "ix_eventos_fila_tenant_fila",
            "tenant_id",
            "fila_id",
            "created_at",
        ),
        Index(
            "ix_eventos_fila_tenant_tipo",
            "tenant_id",
            "tipo",
            "created_at",
        ),
    )

    fila_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("filas_atendimento.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    dados: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )


class PainelChamada(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    BaixaMixin,
):
    __tablename__ = "paineis_chamada"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "estabelecimento_id",
            "setor_id",
            "nome",
            name="uq_painel_chamada_nome",
        ),
        Index("ix_paineis_chamada_tenant_estab", "tenant_id", "estabelecimento_id"),
    )

    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("estabelecimentos.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    setor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("setores.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    nome_abreviado: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    voz_habilitada: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mensagem_rodape: Mapped[str | None] = mapped_column(String(300), nullable=True)
    noticias: Mapped[list[dict] | None] = mapped_column(JSONType, nullable=True)
    ultima_chamada_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ChamadaPainel(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "chamadas_painel"
    __table_args__ = (
        Index(
            "ix_chamadas_painel_tenant_painel",
            "tenant_id",
            "painel_id",
            "chamado_em",
        ),
        Index("ix_chamadas_painel_tenant_fila", "tenant_id", "fila_id"),
        CheckConstraint(
            "tipo IN ('NORMAL','PREFERENCIAL','RECHAMADA')",
            name="ck_chamadas_painel_tipo",
        ),
    )

    painel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("paineis_chamada.id", ondelete="SET NULL"), nullable=True
    )
    fila_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("filas_atendimento.id", ondelete="RESTRICT"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(20), default="NORMAL", nullable=False)
    destino: Mapped[str] = mapped_column(String(120), nullable=False)
    nome_abreviado: Mapped[str] = mapped_column(String(120), nullable=False)
    texto_chamada: Mapped[str] = mapped_column(String(300), nullable=False)
    texto_voz: Mapped[str] = mapped_column(String(300), nullable=False)
    chamado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    chamado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


__all__ = [
    "Agenda",
    "AgendaBloqueio",
    "AgendaHorario",
    "Agendamento",
    "ChamadaPainel",
    "EventoFila",
    "FilaAtendimento",
    "NivelClassificacaoRisco",
    "PainelChamada",
    "ProtocoloClassificacaoRisco",
]
