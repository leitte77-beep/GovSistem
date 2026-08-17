"""O processo administrativo — a espinha dorsal do sistema (seção 130).

`ProcessoInstancia` guarda um CACHE de leitura da etapa atual (evita JOIN em
toda tela de listagem/dashboard). A fonte de verdade é
`ProcessoHistoricoEtapa`, append-only: a única linha com `encerrada_em IS
NULL` é a etapa atual. As duas nunca ficam dessincronizadas porque só
`app/services/workflow.py` pode escrever nelas, sempre na mesma transação.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ActorMixin, Base, Dinheiro, JSONType, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ResultadoEtapa, StatusGeralProcesso


class ProcessoInstancia(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_processos"
    __table_args__ = (
        UniqueConstraint(
            "organizacao_id", "exercicio", "numero_processo", name="uq_govcompras_processo_numero"
        ),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero_processo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    exercicio: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    tipo_processo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    template_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_workflow_templates.id"), nullable=False,
        doc="Versão do workflow congelada no nascimento do processo",
    )
    status_geral: Mapped[str] = mapped_column(
        String(20), default=StatusGeralProcesso.EM_ANDAMENTO.value, nullable=False, index=True
    )

    solicitacao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_solicitacoes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    secretaria_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_secretarias.id"), nullable=False, index=True
    )
    setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_setores.id"), nullable=True
    )
    objeto: Mapped[str] = mapped_column(Text, nullable=False)
    valor_estimado: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)

    # Cadeia de processos (seções 51-52): processo que este sucede/substitui.
    processo_origem_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="SET NULL"), nullable=True
    )
    origem_contrato_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_contratos.id", ondelete="SET NULL", use_alter=True), nullable=True,
        doc="Contrato cujo vencimento motivou a abertura deste processo sucessor",
    )

    # Cache de leitura da etapa atual — atualizado só por app/services/workflow.py.
    etapa_atual_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_workflow_etapas.id"), nullable=True
    )
    etapa_atual_iniciada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    etapa_atual_responsavel_setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_setores.id"), nullable=True
    )
    etapa_atual_responsavel_usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_users.id"), nullable=True
    )

    favorito: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tags: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True, default=None)

    historico: Mapped[list["ProcessoHistoricoEtapa"]] = relationship(
        back_populates="processo", order_by="ProcessoHistoricoEtapa.iniciada_em"
    )


class ProcessoHistoricoEtapa(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Histórico imutável de etapas (fonte de verdade, seção 66).

    Nunca há DELETE. A única UPDATE permitida é fechar a linha aberta
    (`encerrada_em`, `resultado`, `justificativa`) — feito na mesma transação
    que abre a próxima linha.
    """

    __tablename__ = "govcompras_processo_historico_etapas"

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    etapa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_workflow_etapas.id"), nullable=False, index=True
    )
    ordem_execucao: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False, doc="Permite reexecutar a mesma etapa após devolução"
    )
    responsavel_setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_setores.id"), nullable=True
    )
    responsavel_usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_users.id"), nullable=True
    )
    iniciada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    encerrada_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True, doc="NULL = etapa atual"
    )
    resultado: Mapped[str] = mapped_column(
        String(20), default=ResultadoEtapa.EM_ANDAMENTO.value, nullable=False
    )
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_acao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_users.id"), nullable=True
    )

    processo: Mapped["ProcessoInstancia"] = relationship(back_populates="historico")
