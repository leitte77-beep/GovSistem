"""Arquivos e assinaturas (itens 40 e 41).

Um arquivo nunca é referenciado pelo caminho no disco: a API entrega apenas o
`id`, e o download passa por rota autenticada que confere permissão e registra o
acesso. O nome interno é aleatório; o nome original é só um metadado exibido.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    Base,
    GeoMixin,
    JSONType,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import CategoriaArquivo, MetodoAssinatura


class Arquivo(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin, GeoMixin):
    """Anexo (foto, documento, vídeo) ligado a qualquer registro do módulo."""

    __tablename__ = "govinfra_files"
    __table_args__ = (
        Index("ix_govinfra_arquivo_entidade", "entidade", "entidade_id"),
        Index("ix_govinfra_arquivo_hash", "organizacao_id", "hash_sha256"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Vínculo genérico: "solicitacao_cacamba", "ordem", "vistoria", ...
    entidade: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)

    nome_original: Mapped[str] = mapped_column(String(300), nullable=False)
    # Chave no armazenamento — aleatória, nunca derivada do nome enviado.
    chave_armazenamento: Mapped[str] = mapped_column(String(400), nullable=False, unique=True)
    extensao: Mapped[str] = mapped_column(String(10), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    categoria: Mapped[str] = mapped_column(
        String(40), default=CategoriaArquivo.OUTRO.value, nullable=False, index=True
    )
    versao: Mapped[int] = mapped_column(default=1, nullable=False)
    sensivel: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc="Download registrado como acesso a documento sensível na auditoria",
    )
    observacao: Mapped[str | None] = mapped_column(String(400), nullable=True)
    # Data/hora e coordenadas extraídas da foto quando disponíveis (item 24).
    capturado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    metadados: Mapped[dict | None] = mapped_column(JSONType, nullable=True)


class Assinatura(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, GeoMixin):
    """Assinatura coletada (item 41).

    `metodo` deixa explícito o valor jurídico: assinatura simples de recebimento
    (desenhada/código) não se confunde com assinatura digital qualificada, que
    exige o documento assinado anexado.
    """

    __tablename__ = "govinfra_signatures"
    __table_args__ = (Index("ix_govinfra_assinatura_entidade", "entidade", "entidade_id"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entidade: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)

    papel: Mapped[str] = mapped_column(String(30), nullable=False)
    nome_assinante: Mapped[str] = mapped_column(String(200), nullable=False)
    documento_assinante: Mapped[str | None] = mapped_column(String(14), nullable=True)
    pessoa_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_people.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )

    metodo: Mapped[str] = mapped_column(
        String(40), default=MetodoAssinatura.DESENHADA.value, nullable=False
    )
    # Traço da assinatura desenhada (PNG em base64) ou arquivo anexado.
    arquivo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_files.id", ondelete="SET NULL"), nullable=True
    )
    imagem_base64: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Hash do conteúdo assinado — permite provar depois que nada foi alterado.
    hash_documento: Mapped[str | None] = mapped_column(String(64), nullable=True)

    assinado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(60), nullable=True)
    dispositivo: Mapped[str | None] = mapped_column(String(400), nullable=True)
    observacao: Mapped[str | None] = mapped_column(String(400), nullable=True)
