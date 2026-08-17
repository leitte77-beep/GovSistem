"""Licitação: edital, publicação, sessão, adjudicação e homologação
(seções 36-43). Tudo pendurado em `ProcessoInstancia` — não há tabela
"processo licitatório" duplicada."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ActorMixin, Base, Dinheiro, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import SituacaoProposta, StatusEdital


class EditalTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Modelo de edital por modalidade (seção 38-39), com variáveis
    `{{numero_processo}}`, `{{objeto}}` etc. resolvidas em
    `app/services/editais.py`."""

    __tablename__ = "govcompras_edital_templates"

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo_processo: Mapped[str] = mapped_column(String(40), nullable=False)
    conteudo_base: Mapped[str] = mapped_column(Text, nullable=False)
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False)


class Edital(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_editais"
    __table_args__ = (UniqueConstraint("processo_id", name="uq_govcompras_edital_processo"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_edital_templates.id"), nullable=True)
    numero: Mapped[str] = mapped_column(String(40), nullable=False)
    modalidade: Mapped[str] = mapped_column(String(40), nullable=False)
    criterio_julgamento: Mapped[str | None] = mapped_column(String(60), nullable=True)
    conteudo: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=StatusEdital.MINUTA.value, nullable=False)

    publicacoes: Mapped[list["Publicacao"]] = relationship(back_populates="edital", cascade="all, delete-orphan")


class Publicacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Controle de publicações (seção 40)."""

    __tablename__ = "govcompras_publicacoes"

    edital_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_editais.id", ondelete="CASCADE"), nullable=False, index=True
    )
    veiculo: Mapped[str] = mapped_column(String(60), nullable=False, doc="DOU|DIARIO_MUNICIPAL|PNCP|JORNAL|OUTROS")
    data_publicacao: Mapped[date] = mapped_column(Date, nullable=False)
    horario: Mapped[str | None] = mapped_column(String(10), nullable=True)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    comprovante_storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    edital: Mapped["Edital"] = relationship(back_populates="publicacoes")


class Sessao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Sessão pública e julgamento (seção 42)."""

    __tablename__ = "govcompras_sessoes"

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    data_hora: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="abertura", nullable=False, doc="abertura|julgamento|recurso")
    plataforma: Mapped[str | None] = mapped_column(String(120), nullable=True)
    participantes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocorrencias: Mapped[str | None] = mapped_column(Text, nullable=True)
    situacao: Mapped[str] = mapped_column(String(30), default="realizada", nullable=False)


class Proposta(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_propostas"

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fornecedor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_fornecedores.id"), nullable=False)
    valor_proposto: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    situacao: Mapped[str] = mapped_column(String(20), default=SituacaoProposta.CLASSIFICADA.value, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Adjudicacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_adjudicacoes"
    __table_args__ = (UniqueConstraint("processo_id", name="uq_govcompras_adjudicacao_processo"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fornecedor_vencedor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_fornecedores.id"), nullable=False)
    valor_adjudicado: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)


class Homologacao(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_homologacoes"
    __table_args__ = (UniqueConstraint("processo_id", name="uq_govcompras_homologacao_processo"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    autoridade_usuario_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=False)
    valor_homologado: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    publicada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
