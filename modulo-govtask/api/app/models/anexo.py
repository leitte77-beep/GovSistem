import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import CategoriaDocumento, ClassificacaoDocumento, TipoDocumento

if TYPE_CHECKING:
    from app.models.convenio import Convenio
    from app.models.diligencia import Diligencia
    from app.models.entrega_objeto import EntregaObjeto
    from app.models.etapa import Etapa
    from app.models.medicao import Medicao
    from app.models.prestacao_contas import PrestacaoContas
    from app.models.tarefa import Tarefa
    from app.models.user import User


class Anexo(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "anexos"

    convenio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("convenios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    etapa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("etapas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tarefa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tarefas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    medicao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("medicoes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    prestacao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("prestacoes_contas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    diligencia_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("diligencias.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    entrega_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entregas_objetos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    nome_arquivo: Mapped[str] = mapped_column(String(500), nullable=False)
    tipo_documento: Mapped[TipoDocumento] = mapped_column(
        String(20), nullable=False, default=TipoDocumento.OUTRO
    )
    categoria: Mapped[CategoriaDocumento] = mapped_column(
        String(30), nullable=False, default=CategoriaDocumento.OUTROS
    )
    classificacao: Mapped[ClassificacaoDocumento] = mapped_column(
        String(20), nullable=False, default=ClassificacaoDocumento.INTERNO
    )
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    storage_path: Mapped[str] = mapped_column(
        String(1000), nullable=False, comment="Caminho no storage (S3/local)"
    )
    tamanho_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    versao: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1,
        comment="Número da versão do documento (versionamento por tipo+contexto)"
    )
    enviado_por_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    motivo_versao: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True, comment="Motivo da alteração/substituição"
    )
    enviado_externo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enviado_externo_data: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    enviado_externo_sistema: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    enviado_externo_protocolo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    enviado_externo_observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    convenio: Mapped["Convenio"] = relationship(
        "Convenio", back_populates="anexos", foreign_keys=[convenio_id]
    )
    etapa: Mapped[Optional["Etapa"]] = relationship(
        "Etapa", back_populates="anexos", foreign_keys=[etapa_id]
    )
    tarefa: Mapped[Optional["Tarefa"]] = relationship(
        "Tarefa", back_populates="anexos", foreign_keys=[tarefa_id]
    )
    medicao: Mapped[Optional["Medicao"]] = relationship(
        "Medicao", back_populates="anexos", foreign_keys=[medicao_id]
    )
    prestacao: Mapped[Optional["PrestacaoContas"]] = relationship(
        "PrestacaoContas", back_populates="anexos", foreign_keys=[prestacao_id]
    )
    diligencia: Mapped[Optional["Diligencia"]] = relationship(
        "Diligencia", back_populates="anexos", foreign_keys=[diligencia_id]
    )
    entrega: Mapped[Optional["EntregaObjeto"]] = relationship(
        "EntregaObjeto", back_populates="anexos", foreign_keys=[entrega_id]
    )
    enviado_por: Mapped["User"] = relationship("User", foreign_keys=[enviado_por_id])

    def __repr__(self) -> str:
        return f"<Anexo {self.nome_arquivo} v{self.versao}>"
