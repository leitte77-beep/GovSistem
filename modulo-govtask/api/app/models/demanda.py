"""Demanda — entidade raiz do GovTask (§2, §5).

A demanda é o processo principal: tudo o que surge (uma determinação do
Prefeito, um pedido de autoridade, uma obra, uma aquisição) nasce como demanda
e só morre quando efetivamente concluída. Etapas, tarefas, documentos,
protocolos, convênios, licitações, contratos e obras penduram-se nela.

Regra fundamental do módulo: o status da demanda é independente do status das
tarefas (§3). Uma tarefa concluída não conclui a demanda.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import (
    ConfidencialidadeDemanda,
    EsferaRecurso,
    OrigemDemanda,
    PrioridadeDemanda,
)

if TYPE_CHECKING:
    from app.models.autoridade import Autoridade
    from app.models.checklist import Checklist
    from app.models.demanda_financeiro import RegistroFinanceiroDemanda
    from app.models.obra import Obra
    from app.models.catalogo import CategoriaDemanda, DemandaTag, StatusDemanda, TipoDemanda
    from app.models.demanda_participante import DemandaParticipante, DemandaSeguidor
    from app.models.protocolo_externo import ProtocoloExterno
    from app.models.setor import Setor
    from app.models.template_fluxo import TemplateFluxo
    from app.models.user import User


class Demanda(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "demandas"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "exercicio", "sequencial",
            name="uq_demanda_org_exercicio_sequencial",
        ),
        UniqueConstraint("organization_id", "numero", name="uq_demanda_org_numero"),
        Index("ix_demandas_org_status", "organization_id", "status_id"),
        Index("ix_demandas_org_responsavel", "organization_id", "responsavel_geral_id"),
        Index("ix_demandas_org_setor_atual", "organization_id", "setor_atual_id"),
        Index("ix_demandas_org_prazo", "organization_id", "prazo_final"),
        Index("ix_demandas_org_movimentacao", "organization_id", "ultima_movimentacao_em"),
    )

    # ── Identificação ─────────────────────────────────────
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    numero: Mapped[str] = mapped_column(
        String(40), nullable=False, index=True,
        comment="Número formatado exibido ao usuário (ex.: 2026/000125)",
    )
    exercicio: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    sequencial: Mapped[int] = mapped_column(Integer, nullable=False)
    versao: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1",
        comment="Controle de concorrência otimista (§120): incrementa a cada alteração",
    )

    titulo: Mapped[str] = mapped_column(String(500), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resumo_executivo: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Resumo gerencial da situação (§91); preenchido por humano ou sugerido por IA",
    )
    objeto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assunto: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # ── Classificação ─────────────────────────────────────
    tipo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demanda_tipos.id", ondelete="RESTRICT"),
        nullable=True, index=True,
    )
    categoria_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demanda_categorias.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    subcategoria_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demanda_categorias.id", ondelete="SET NULL"),
        nullable=True,
    )
    status_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demanda_status.id", ondelete="RESTRICT"),
        nullable=True, index=True,
    )
    prioridade: Mapped[PrioridadeDemanda] = mapped_column(
        String(15), nullable=False, default=PrioridadeDemanda.NORMAL, index=True
    )
    criticidade: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    impacto: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    confidencialidade: Mapped[ConfidencialidadeDemanda] = mapped_column(
        String(20), nullable=False, default=ConfidencialidadeDemanda.NORMAL, index=True
    )
    is_rascunho: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Demanda ainda não publicada (§122): invisível nas listas operacionais",
    )
    arquivada_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Arquivamento (§142): sai das listas, continua pesquisável",
    )

    # ── Origem (§6) ───────────────────────────────────────
    origem: Mapped[Optional[OrigemDemanda]] = mapped_column(
        String(40), nullable=True, index=True
    )
    origem_descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    autoridade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("autoridades.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # ── Pessoas e lotação ─────────────────────────────────
    criado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    solicitante_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    solicitante_externo: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Solicitante sem usuário no sistema (autoridade, cidadão, empresa)",
    )
    responsavel_geral_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False, index=True,
        comment="Dono da demanda de ponta a ponta — não muda a cada encaminhamento (§24)",
    )
    gestor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    responsavel_atual_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
        comment="Quem está com a demanda neste momento",
    )
    setor_solicitante_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"), nullable=True
    )
    setor_atual_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # ── Workflow (§17) ────────────────────────────────────
    template_fluxo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates_fluxo.id", ondelete="SET NULL"),
        nullable=True,
    )
    fluxo_livre: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        comment="Sem workflow fixo: encaminhamento direto a qualquer setor autorizado (§19)",
    )
    progresso: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="0–100, calculado pelos pesos das etapas (§68)",
    )

    # ── Próxima ação (§16) ────────────────────────────────
    proxima_acao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proxima_acao_responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    proxima_acao_prazo: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Bloqueio / espera externa (§69, §70) ──────────────
    bloqueada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    bloqueio_motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bloqueio_desde: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    bloqueio_previsao: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    aguardando_terceiro: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Órgão/pessoa que estamos aguardando"
    )
    aguardando_desde: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    proximo_followup: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, comment="Quando cobrar novamente (§71, §72)"
    )

    # ── Datas e prazos (§35) ──────────────────────────────
    data_solicitacao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    prazo_final: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    prazo_legal: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    prazo_interno: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    previsao_conclusao: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    concluida_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ultima_movimentacao_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="Alimenta o alerta de demanda parada (§39)",
    )

    # ── Financeiro gerencial (§59) ────────────────────────
    valor_previsto: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_aprovado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_contratado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_executado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_contrapartida: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_licitado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_empenhado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_liquidado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_pago: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    fonte_recurso: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    esfera: Mapped[Optional[EsferaRecurso]] = mapped_column(
        String(20), nullable=True, index=True
    )
    orgao_concedente: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    programa: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # ── Encerramento (§146) ───────────────────────────────
    resultado_final: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    motivo_cancelamento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Extensões por tipo ────────────────────────────────
    campos_extras: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Campos específicos do tipo de demanda, validados na camada de serviço",
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Demanda de origem, quando esta foi duplicada de outra (§83).
    duplicada_de_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="SET NULL"), nullable=True
    )
    # Demanda pai, quando este é um desdobramento de um projeto maior (§221).
    # O progresso agregado da pai soma as filhas (§222).
    demanda_pai_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # ── Relacionamentos ───────────────────────────────────
    tipo: Mapped[Optional["TipoDemanda"]] = relationship("TipoDemanda", lazy="selectin")
    categoria: Mapped[Optional["CategoriaDemanda"]] = relationship(
        "CategoriaDemanda", foreign_keys=[categoria_id], lazy="selectin"
    )
    subcategoria: Mapped[Optional["CategoriaDemanda"]] = relationship(
        "CategoriaDemanda", foreign_keys=[subcategoria_id]
    )
    status: Mapped[Optional["StatusDemanda"]] = relationship(
        "StatusDemanda", lazy="selectin"
    )
    autoridade: Mapped[Optional["Autoridade"]] = relationship(
        "Autoridade", back_populates="demandas", lazy="selectin"
    )
    criado_por: Mapped["User"] = relationship("User", foreign_keys=[criado_por_id])
    solicitante: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[solicitante_id]
    )
    responsavel_geral: Mapped["User"] = relationship(
        "User", foreign_keys=[responsavel_geral_id], lazy="selectin"
    )
    gestor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[gestor_id])
    responsavel_atual: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[responsavel_atual_id], lazy="selectin"
    )
    setor_solicitante: Mapped[Optional["Setor"]] = relationship(
        "Setor", foreign_keys=[setor_solicitante_id]
    )
    setor_atual: Mapped[Optional["Setor"]] = relationship(
        "Setor", foreign_keys=[setor_atual_id], lazy="selectin"
    )
    template_fluxo: Mapped[Optional["TemplateFluxo"]] = relationship("TemplateFluxo")

    tags: Mapped[List["DemandaTag"]] = relationship(
        "DemandaTag", lazy="selectin", cascade="all, delete-orphan"
    )
    participantes: Mapped[List["DemandaParticipante"]] = relationship(
        "DemandaParticipante", back_populates="demanda",
        lazy="selectin", cascade="all, delete-orphan",
    )
    seguidores: Mapped[List["DemandaSeguidor"]] = relationship(
        "DemandaSeguidor", back_populates="demanda", cascade="all, delete-orphan"
    )
    protocolos: Mapped[List["ProtocoloExterno"]] = relationship(
        "ProtocoloExterno", back_populates="demanda",
        cascade="all, delete-orphan", order_by="ProtocoloExterno.data_protocolo",
    )
    checklists: Mapped[List["Checklist"]] = relationship(
        "Checklist", back_populates="demanda", cascade="all, delete-orphan",
    )
    registros_financeiros: Mapped[List["RegistroFinanceiroDemanda"]] = relationship(
        "RegistroFinanceiroDemanda", back_populates="demanda",
        cascade="all, delete-orphan",
        order_by="RegistroFinanceiroDemanda.data_registro",
    )
    obras: Mapped[List["Obra"]] = relationship(
        "Obra", back_populates="demanda", viewonly=True,
    )

    @property
    def saldo_financeiro(self) -> Decimal:
        """Quanto do valor aprovado ainda não foi pago (§59).

        Usa o aprovado como base porque é o valor que o Município pode gastar;
        o previsto é expectativa e superestimaria o saldo disponível.
        """
        base = self.valor_aprovado or self.valor_contratado or self.valor_previsto or Decimal(0)
        return Decimal(base) - Decimal(self.valor_pago or 0)

    # ── Propriedades calculadas ───────────────────────────
    @property
    def tags_rotulos(self) -> list[str]:
        return [v.tag.rotulo for v in self.tags if v.tag is not None]

    @property
    def encerrada(self) -> bool:
        return self.concluida_em is not None or (
            self.status is not None and self.status.is_final
        )

    @property
    def atrasada(self) -> bool:
        """Passou do prazo final e ainda não foi encerrada."""
        if self.encerrada or self.prazo_final is None:
            return False
        prazo = self.prazo_final
        if prazo.tzinfo is None:
            prazo = prazo.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > prazo

    @property
    def dias_sem_movimentacao(self) -> int:
        referencia = self.ultima_movimentacao_em
        if referencia.tzinfo is None:
            referencia = referencia.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - referencia).days

    def __repr__(self) -> str:
        return f"<Demanda {self.numero} {self.titulo[:40]}>"
