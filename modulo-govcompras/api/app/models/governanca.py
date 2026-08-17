"""Transversais: documentos, comentários, notificações, auditoria, numeração
e log de integrações (seções 40-41, 64-68, 74-76, 118)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ActorMixin, Base, JSONType, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    CategoriaDocumento,
    ResultadoAuditoria,
    SituacaoNotificacao,
    StatusDocumento,
    StatusIntegracao,
)


class Documento(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Repositório de documentos polimórfico e versionado (seções 83-85).

    Uma tabela só para todo o sistema — evita duplicar `*_anexos` em cada
    domínio (solicitação, planejamento, edital, contrato, fiscalização...).
    """

    __tablename__ = "govcompras_documentos"
    __table_args__ = (
        UniqueConstraint(
            "entidade_tipo", "entidade_id", "categoria", "versao", name="uq_govcompras_documento_versao"
        ),
        Index("ix_govcompras_documento_entidade", "entidade_tipo", "entidade_id"),
    )

    entidade_tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    categoria: Mapped[str] = mapped_column(String(30), default=CategoriaDocumento.OUTROS.value, nullable=False)
    nome_arquivo: Mapped[str] = mapped_column(String(300), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tamanho_bytes: Mapped[int | None] = mapped_column(nullable=True)
    versao: Mapped[int] = mapped_column(default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=StatusDocumento.RASCUNHO.value, nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)


class Comentario(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Comunicação interna por processo/entidade, com menções (seções 64-65)."""

    __tablename__ = "govcompras_comentarios"
    __table_args__ = (Index("ix_govcompras_comentario_entidade", "entidade_tipo", "entidade_id"),)

    entidade_tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    autor_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=False)
    conteudo: Mapped[str] = mapped_column(Text, nullable=False)
    mencoes_usuario_ids: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)


class Notificacao(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_notificacoes"
    __table_args__ = (
        Index("ix_govcompras_notif_destino", "destinatario_usuario_id", "situacao", "created_at"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    destinatario_usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    destinatario_setor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_setores.id"), nullable=True, index=True
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    entidade_tipo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)
    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoNotificacao.NAO_LIDA.value, nullable=False, index=True
    )
    lida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditoriaLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Trilha de auditoria (seção 67) — append-only, sem rota de edição/exclusão."""

    __tablename__ = "govcompras_auditoria_logs"
    __table_args__ = (
        Index("ix_govcompras_auditoria_entidade", "entidade_tipo", "entidade_id"),
        Index("ix_govcompras_auditoria_usuario", "organizacao_id", "usuario_id", "created_at"),
    )

    organizacao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govcompras_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    usuario_nome: Mapped[str | None] = mapped_column(String(200), nullable=True)
    usuario_perfil: Mapped[str | None] = mapped_column(String(40), nullable=True)
    acao: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entidade_tipo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    entidade_descricao: Mapped[str | None] = mapped_column(String(300), nullable=True)
    resultado: Mapped[str] = mapped_column(String(20), default=ResultadoAuditoria.SUCESSO.value, nullable=False)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    dados_antes: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    dados_depois: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(60), nullable=True)
    correlacao: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)


class ContadorNumeracao(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Sequência por escopo/exercício (seção 37) — travada em transação
    (`SELECT ... FOR UPDATE`) para nunca gerar dois números iguais."""

    __tablename__ = "govcompras_contadores"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "escopo", "exercicio", name="uq_govcompras_contador"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    escopo: Mapped[str] = mapped_column(
        String(60), nullable=False, doc="processo:pregao | contrato | ata | aditivo | ..."
    )
    exercicio: Mapped[int] = mapped_column(nullable=False)
    valor: Mapped[int] = mapped_column(default=0, nullable=False)


class IntegracaoLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Log de tentativas de integração externa (seção 118).

    Nenhuma integração real (PNCP, e-mail, WhatsApp, ICP-Brasil) é chamada
    nesta POC — os serviços em `app/services/integracoes/` só gravam aqui um
    registro `NAO_CONFIGURADO`, deixando a interface pronta para a fase em que
    as credenciais reais existirem (seção 116: "não desenvolver integrações
    falsas").
    """

    __tablename__ = "govcompras_integracao_logs"

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sistema: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    operacao: Mapped[str] = mapped_column(String(80), nullable=False)
    entidade_tipo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    situacao: Mapped[str] = mapped_column(String(30), default=StatusIntegracao.NAO_CONFIGURADO.value, nullable=False)
    mensagem: Mapped[str | None] = mapped_column(Text, nullable=True)
    tentativas: Mapped[int] = mapped_column(default=1, nullable=False)
