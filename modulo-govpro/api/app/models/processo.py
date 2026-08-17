import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TenantMixin, TimestampMixin
from app.models.enums import EstadoProcessoUnidade, NivelAcesso, SituacaoProcesso

if TYPE_CHECKING:
    from app.models.interessado import Interessado


class Processo(Base, TimestampMixin, SoftDeleteMixin, TenantMixin):
    """Processo administrativo: unidade de agregação de documentos e andamentos."""

    __tablename__ = "processos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "nup", name="uq_processo_tenant_nup"),
        Index("ix_processos_tenant_situacao", "tenant_id", "situacao"),
        Index("ix_processos_tenant_tipo", "tenant_id", "tipo_processo_id"),
    )

    nup: Mapped[str] = mapped_column(
        String(25), nullable=False, comment="Número Único de Protocolo (formato configurável)"
    )
    numero_antigo: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, comment="Número do processo físico migrado (se houver)"
    )
    tipo_processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tipos_processo.id", ondelete="RESTRICT"),
        nullable=False,
    )
    especificacao: Mapped[str] = mapped_column(
        String(500), nullable=False, comment="Assunto/objeto do processo (texto curto)"
    )
    classe_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plano_classificacao.id", ondelete="SET NULL"),
        nullable=True,
        comment="Classificação arquivística (herdada do tipo, alterável)",
    )
    nivel_acesso: Mapped[str] = mapped_column(
        String(20),
        default=NivelAcesso.PUBLICO.value,
        nullable=False,
        comment="Publicidade é a regra; sigilo é exceção fundamentada",
    )
    hipotese_legal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hipoteses_legais.id", ondelete="SET NULL"),
        nullable=True,
    )
    situacao: Mapped[str] = mapped_column(
        String(30), default=SituacaoProcesso.EM_TRAMITACAO.value, nullable=False
    )
    unidade_protocolizadora_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="SET NULL"),
        nullable=True,
    )
    autuado_por_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Servidor atribuído como responsável direto pelo processo (Minha Caixa)",
    )
    data_autuacao: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sigilo_expira_em: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
        comment="Data de expiração automática do sigilo do processo (LAI)",
    )
    eliminado_em: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
        comment="Expurgo lógico (eliminação arquivística) — metadados sobrevivem",
    )

    interessados: Mapped[List["Interessado"]] = relationship(
        "Interessado", lazy="selectin", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Processo {self.nup}>"


class ProcessoUnidade(Base, TimestampMixin, TenantMixin):
    """Estado do processo dentro de uma unidade (tramitação simultânea)."""

    __tablename__ = "processos_unidades"
    __table_args__ = (
        UniqueConstraint("processo_id", "unidade_id", name="uq_processo_unidade"),
        Index("ix_processo_unidade_tenant_estado", "tenant_id", "estado"),
    )

    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    unidade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("unidades.id", ondelete="CASCADE"),
        nullable=False,
    )
    estado: Mapped[str] = mapped_column(
        String(20), default=EstadoProcessoUnidade.RECEBIDO.value, nullable=False
    )
    recebido_em: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    concluido_em: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    def __repr__(self) -> str:
        return f"<ProcessoUnidade p={self.processo_id} u={self.unidade_id} {self.estado}>"


class ProcessoVisualizacao(Base, TenantMixin):
    """Marca que um usuário já abriu o processo (para a aba "Não visualizados")."""

    __tablename__ = "processos_visualizacoes"
    __table_args__ = (
        UniqueConstraint("processo_id", "user_id", name="uq_processo_visualizacao"),
        Index("ix_processo_visualizacao_tenant_user", "tenant_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processos.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    visualizado_em: Mapped[datetime] = mapped_column(nullable=False)

    def __repr__(self) -> str:
        return f"<ProcessoVisualizacao p={self.processo_id} u={self.user_id}>"
