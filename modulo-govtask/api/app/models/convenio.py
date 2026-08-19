import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, JSON, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import StatusConvenio, TipoConvenio

if TYPE_CHECKING:
    from app.models.anexo import Anexo
    from app.models.contrato import Contrato
    from app.models.diligencia import Diligencia
    from app.models.entrega_objeto import EntregaObjeto
    from app.models.etapa import Etapa
    from app.models.evento_timeline import EventoTimeline
    from app.models.licitacao import Licitacao
    from app.models.medicao import Medicao
    from app.models.movimento_financeiro import MovimentoFinanceiro
    from app.models.notificacao import Notificacao
    from app.models.obra import Obra
    from app.models.prestacao_contas import PrestacaoContas
    from app.models.repasse import Repasse
    from app.models.tarefa import Tarefa
    from app.models.template_fluxo import TemplateFluxo
    from app.models.user import User


class Convenio(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "convenios"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    titulo: Mapped[str] = mapped_column(String(500), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo: Mapped[TipoConvenio] = mapped_column(
        String(20), nullable=False, default=TipoConvenio.OUTRO
    )
    origem: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Órgão/entidade de origem do convênio"
    )
    numero_protocolo_governo: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, index=True,
        comment="Número de protocolo no sistema do governo"
    )
    valor: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    status: Mapped[StatusConvenio] = mapped_column(
        String(20), nullable=False, default=StatusConvenio.RASCUNHO
    )
    data_protocolo: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    responsavel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    template_fluxo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates_fluxo.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Cadastro rico do processo ──────────────────────────
    categoria: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True, index=True,
        comment="Categoria do recurso (emenda, convênio, transferência, etc.)"
    )
    esfera: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, index=True, comment="Federal/Estadual/Municipal"
    )
    prioridade: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    situacao: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True, index=True,
        comment="Situação detalhada do processo (status rico)"
    )
    parlamentar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    parlamentar_cargo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    partido: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    orgao_concedente: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    programa: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    finalidade: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Identificadores externos (numeração de instrumentos)
    numero_proposta: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    numero_instrumento: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    numero_convenio: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    numero_contrato_repasse: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    numero_emenda: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    numero_plano_acao: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    numero_plano_trabalho: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Valores
    valor_solicitado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_aprovado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_repasse: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    contrapartida: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_executado: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    valor_pago: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)
    saldo: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2), nullable=True)

    # Datas
    data_aprovacao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data_assinatura: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    vigencia_inicio: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    vigencia_fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    prazo_execucao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    prazo_prestacao_contas: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    previsao_conclusao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    conclusao_efetiva: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Responsáveis complementares
    gestor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    fiscal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    engenheiro_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Links e identificadores externos flexíveis
    links_externos: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    identificadores_externos: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Relationships
    responsavel: Mapped["User"] = relationship("User", foreign_keys=[responsavel_id])
    gestor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[gestor_id])
    fiscal: Mapped[Optional["User"]] = relationship("User", foreign_keys=[fiscal_id])
    engenheiro: Mapped[Optional["User"]] = relationship("User", foreign_keys=[engenheiro_id])
    template_fluxo: Mapped[Optional["TemplateFluxo"]] = relationship(
        "TemplateFluxo", back_populates="convenios"
    )
    etapas: Mapped[List["Etapa"]] = relationship(
        "Etapa", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan", order_by="Etapa.ordem",
    )
    tarefas: Mapped[List["Tarefa"]] = relationship(
        "Tarefa", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    anexos: Mapped[List["Anexo"]] = relationship(
        "Anexo", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
        primaryjoin="and_(Anexo.convenio_id == Convenio.id, Anexo.tarefa_id.is_(None), Anexo.etapa_id.is_(None), Anexo.deleted_at.is_(None))",
        viewonly=True,
    )
    eventos: Mapped[List["EventoTimeline"]] = relationship(
        "EventoTimeline", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan", order_by="EventoTimeline.ocorrido_em",
    )
    notificacoes: Mapped[List["Notificacao"]] = relationship(
        "Notificacao", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    diligencias: Mapped[List["Diligencia"]] = relationship(
        "Diligencia", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    repasses: Mapped[List["Repasse"]] = relationship(
        "Repasse", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan", order_by="Repasse.parcela",
    )
    medicoes: Mapped[List["Medicao"]] = relationship(
        "Medicao", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan", order_by="Medicao.numero",
    )
    movimentos_financeiros: Mapped[List["MovimentoFinanceiro"]] = relationship(
        "MovimentoFinanceiro", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    contratos: Mapped[List["Contrato"]] = relationship(
        "Contrato", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    licitacoes: Mapped[List["Licitacao"]] = relationship(
        "Licitacao", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    prestacoes: Mapped[List["PrestacaoContas"]] = relationship(
        "PrestacaoContas", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    entregas: Mapped[List["EntregaObjeto"]] = relationship(
        "EntregaObjeto", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )
    obras: Mapped[List["Obra"]] = relationship(
        "Obra", back_populates="convenio", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Convenio {self.titulo} [{self.status.value}]>"
