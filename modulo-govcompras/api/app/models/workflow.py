"""Motor de workflow configurável — núcleo do GovCompras (seções 14-19, 109).

Cada tipo de processo (Pregão, Dispensa, Inexigibilidade, Credenciamento,
Adesão a Ata, Contratação Emergencial) tem seu próprio `WorkflowTemplate` com
etapas, requisitos de avanço e transições configuráveis pelo administrador —
nada disso é hardcoded no serviço de workflow (`app/services/workflow.py`).

Versionamento: editar um template em produção NÃO altera a linha existente —
cria uma nova versão (`versao + 1`) e marca a antiga `ativo=False`. Processos
já instanciados continuam presos ao `template_id` em que nasceram, então uma
mudança de fluxo pelo admin nunca corrompe um processo em andamento.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import TipoEtapa, TipoProcesso, TipoRequisito, TipoTransicao


class WorkflowTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_workflow_templates"
    __table_args__ = (
        UniqueConstraint(
            "organizacao_id", "tipo_processo", "versao", name="uq_govcompras_workflow_versao"
        ),
        Index("ix_govcompras_workflow_ativo", "organizacao_id", "tipo_processo", "ativo"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo_processo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    versao: Mapped[int] = mapped_column(default=1, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    etapas: Mapped[list["WorkflowEtapa"]] = relationship(
        back_populates="template", order_by="WorkflowEtapa.ordem", cascade="all, delete-orphan", lazy="selectin"
    )

    @staticmethod
    def tipos_disponiveis() -> list[str]:
        return [t.value for t in TipoProcesso]


class WorkflowEtapa(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_workflow_etapas"
    __table_args__ = (
        UniqueConstraint("template_id", "ordem", name="uq_govcompras_etapa_ordem"),
        UniqueConstraint("template_id", "codigo", name="uq_govcompras_etapa_codigo"),
    )

    template_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_workflow_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordem: Mapped[int] = mapped_column(nullable=False)
    codigo: Mapped[str] = mapped_column(String(60), nullable=False, doc="Slug estável entre versões")
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo_etapa: Mapped[str] = mapped_column(String(20), default=TipoEtapa.MANUAL.value, nullable=False)
    setor_papel_funcional: Mapped[str | None] = mapped_column(
        String(40), nullable=True, doc="Papel funcional do setor responsável (compras/licitacao/...)"
    )
    perfil_responsavel: Mapped[str | None] = mapped_column(
        String(40), nullable=True, doc="Alternativa: perfil funcional quando não há setor fixo"
    )
    sla_dias: Mapped[int] = mapped_column(nullable=False, default=5)
    etapa_final: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cancelavel: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    template: Mapped["WorkflowTemplate"] = relationship(back_populates="etapas")
    requisitos: Mapped[list["WorkflowEtapaRequisito"]] = relationship(
        back_populates="etapa", cascade="all, delete-orphan", lazy="selectin"
    )
    transicoes_saida: Mapped[list["WorkflowTransicao"]] = relationship(
        back_populates="etapa_origem",
        foreign_keys="WorkflowTransicao.etapa_origem_id",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class WorkflowEtapaRequisito(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Condição que precisa estar satisfeita para a etapa avançar.

    `MANUAL_CHECK`: alguém marca manualmente (`satisfeito_manual_em`).
    `ENTIDADE_STATUS`: resolvido em código por um registry de funções
    (`app/services/workflow_requisitos.py`), consultando o status real de
    outra entidade (ex.: Termo de Referência aprovado, dotação confirmada).
    """

    __tablename__ = "govcompras_workflow_requisitos"

    etapa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_workflow_etapas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(20), default=TipoRequisito.MANUAL_CHECK.value, nullable=False)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    entidade_ref: Mapped[str | None] = mapped_column(
        String(80), nullable=True, doc='Chave do registry, ex.: "termo_referencia", "dotacao"'
    )
    obrigatorio: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    satisfeito_manual_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    satisfeito_manual_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_users.id", ondelete="SET NULL"), nullable=True
    )

    etapa: Mapped["WorkflowEtapa"] = relationship(back_populates="requisitos")


class WorkflowTransicao(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Grafo de transições possíveis a partir de uma etapa.

    Não é uma sequência linear: "devolver" quase nunca volta à etapa
    imediatamente anterior (ex.: devolver da Sessão de Julgamento direto para
    a Elaboração do TR), por isso cada etapa pode ter múltiplas transições de
    devolução configuradas para destinos diferentes.
    """

    __tablename__ = "govcompras_workflow_transicoes"

    etapa_origem_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_workflow_etapas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    etapa_destino_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_workflow_etapas.id", ondelete="SET NULL"), nullable=True
    )
    tipo: Mapped[str] = mapped_column(String(20), default=TipoTransicao.AVANCAR.value, nullable=False)
    rotulo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    exige_justificativa: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    etapa_origem: Mapped["WorkflowEtapa"] = relationship(
        back_populates="transicoes_saida", foreign_keys=[etapa_origem_id]
    )
    etapa_destino: Mapped["WorkflowEtapa | None"] = relationship(foreign_keys=[etapa_destino_id])
