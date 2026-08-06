import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import TipoDocumento

if TYPE_CHECKING:
    from app.models.convenio import Convenio
    from app.models.etapa import Etapa
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
    nome_arquivo: Mapped[str] = mapped_column(String(500), nullable=False)
    tipo_documento: Mapped[TipoDocumento] = mapped_column(
        String(20), nullable=False, default=TipoDocumento.OUTRO
    )
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
    enviado_por: Mapped["User"] = relationship("User", foreign_keys=[enviado_por_id])

    def __repr__(self) -> str:
        return f"<Anexo {self.nome_arquivo} v{self.versao}>"
