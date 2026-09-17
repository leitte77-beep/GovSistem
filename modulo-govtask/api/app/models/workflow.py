"""Motor de workflow configurável (§17, §18, §25, §32, §68).

O administrador monta o fluxo; o código não conhece nenhuma etapa por nome.

Fluxos são **versionados**. Publicar uma nova versão não mexe nas demandas em
andamento: cada demanda guarda a versão com que começou, de modo que o
histórico continue explicável meses depois ("por que esta demanda pulou a
etapa de análise?" — porque a versão vigente na época não a tinha).

Uma etapa do modelo (`WorkflowEtapa`) é a receita; a etapa instanciada na
demanda continua sendo a tabela `etapas`, que ganhou o vínculo com a receita.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import (
    ModoEtapa,
    NaturezaEtapa,
    RegraConclusaoEtapa,
    StatusWorkflowVersao,
    TipoContagemPrazo,
    TipoTarefa,
)

if TYPE_CHECKING:
    from app.models.catalogo import StatusDemanda, TipoDemanda
    from app.models.setor import Setor
    from app.models.user import User


class Workflow(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "workflows"
    __table_args__ = (
        UniqueConstraint("organization_id", "chave", name="uq_workflow_org_chave"),
    )

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="NULL = modelo padrão do sistema, disponível a todos os tenants",
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tipo_demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demanda_tipos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Sugerido automaticamente para demandas deste tipo",
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    tipo_demanda: Mapped[Optional["TipoDemanda"]] = relationship("TipoDemanda")
    versoes: Mapped[List["WorkflowVersao"]] = relationship(
        "WorkflowVersao",
        back_populates="workflow",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="WorkflowVersao.versao",
    )

    @property
    def versao_publicada(self) -> Optional["WorkflowVersao"]:
        publicadas = [
            v for v in self.versoes if v.status == StatusWorkflowVersao.PUBLICADA
        ]
        return max(publicadas, key=lambda v: v.versao) if publicadas else None

    def __repr__(self) -> str:
        return f"<Workflow {self.chave}>"


class WorkflowVersao(Base, TimestampMixin):
    """Uma fotografia imutável do desenho do fluxo.

    Rascunho é editável; publicada, não. Para mudar um fluxo em uso, cria-se a
    versão seguinte — as demandas que já rodavam continuam na anterior.
    """

    __tablename__ = "workflow_versoes"
    __table_args__ = (
        UniqueConstraint("workflow_id", "versao", name="uq_workflow_versao"),
    )

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    versao: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[StatusWorkflowVersao] = mapped_column(
        String(20), nullable=False, default=StatusWorkflowVersao.RASCUNHO, index=True
    )
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    publicada_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    publicada_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="versoes")
    publicada_por: Mapped[Optional["User"]] = relationship("User")
    etapas: Mapped[List["WorkflowEtapa"]] = relationship(
        "WorkflowEtapa",
        back_populates="versao",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="WorkflowEtapa.ordem",
    )

    @property
    def editavel(self) -> bool:
        return self.status == StatusWorkflowVersao.RASCUNHO

    def __repr__(self) -> str:
        return f"<WorkflowVersao {self.workflow_id} v{self.versao} [{self.status}]>"


class WorkflowEtapa(Base, TimestampMixin):
    """A receita de uma etapa: quem faz, em quanto tempo, e o que ela exige."""

    __tablename__ = "workflow_etapas"
    __table_args__ = (
        UniqueConstraint("versao_id", "chave", name="uq_workflow_etapa_chave"),
    )

    versao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_versoes.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    peso: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="Participação da etapa no progresso da demanda (§68). "
                "Somando zero em todas, o peso é distribuído igualmente",
    )
    modo: Mapped[ModoEtapa] = mapped_column(
        String(20), nullable=False, default=ModoEtapa.SEQUENCIAL,
        comment="PARALELA abre junto com as demais de mesma ordem (§25)",
    )
    natureza: Mapped[NaturezaEtapa] = mapped_column(
        String(20), nullable=False, default=NaturezaEtapa.INTERNA
    )
    regra_conclusao: Mapped[RegraConclusaoEtapa] = mapped_column(
        String(20), nullable=False, default=RegraConclusaoEtapa.TODAS_TAREFAS
    )

    setor_responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"), nullable=True
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    prazo_dias: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Prazo automático contado da abertura da etapa"
    )
    tipo_contagem: Mapped[TipoContagemPrazo] = mapped_column(
        String(20), nullable=False, default=TipoContagemPrazo.DIAS_UTEIS
    )
    exige_aprovacao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    documentos_obrigatorios: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True,
        comment="Rótulos dos documentos exigidos para concluir a etapa (§32)",
    )
    condicao: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Regra que decide se a etapa se aplica a esta demanda; "
                "ausente = sempre se aplica",
    )
    status_demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demanda_status.id", ondelete="SET NULL"),
        nullable=True,
        comment="Situação que a demanda assume ao entrar nesta etapa",
    )
    is_final: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Concluir esta etapa encerra o fluxo (não a demanda)",
    )

    versao: Mapped["WorkflowVersao"] = relationship(
        "WorkflowVersao", back_populates="etapas"
    )
    setor_responsavel: Mapped[Optional["Setor"]] = relationship("Setor")
    status_demanda: Mapped[Optional["StatusDemanda"]] = relationship("StatusDemanda")
    tarefas_modelo: Mapped[List["WorkflowTarefaModelo"]] = relationship(
        "WorkflowTarefaModelo",
        back_populates="etapa",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="WorkflowTarefaModelo.ordem",
    )

    def __repr__(self) -> str:
        return f"<WorkflowEtapa {self.chave} ordem={self.ordem}>"


class WorkflowTarefaModelo(Base, TimestampMixin):
    """Tarefa criada automaticamente quando a etapa abre (§80)."""

    __tablename__ = "workflow_etapa_tarefas"

    etapa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_etapas.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    titulo: Mapped[str] = mapped_column(String(500), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    tipo: Mapped[TipoTarefa] = mapped_column(
        String(20), nullable=False, default=TipoTarefa.EXECUCAO
    )
    setor_destino_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"), nullable=True
    )
    prazo_dias: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    exige_documento: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_comentario: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_aprovacao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_aceite: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    etapa: Mapped["WorkflowEtapa"] = relationship(
        "WorkflowEtapa", back_populates="tarefas_modelo"
    )
    setor_destino: Mapped[Optional["Setor"]] = relationship("Setor")

    def __repr__(self) -> str:
        return f"<WorkflowTarefaModelo {self.titulo[:40]}>"
