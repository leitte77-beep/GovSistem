"""Trilha de auditoria append-only, particionada por mês no PostgreSQL.

A chave primária inclui ``created_at`` porque o PostgreSQL exige a coluna de
particionamento na chave. A API nunca atualiza nem apaga linhas: o serviço só
insere. Um trigger no banco (migração) bloqueia UPDATE/DELETE inclusive para
SQL direto; o guard ORM antecipa o erro na suíte SQLite.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, event
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONType, utcnow


class AuditTrail(Base):
    __tablename__ = "audit_trail"
    __table_args__ = (
        Index("ix_audit_tenant_data", "tenant_id", "created_at"),
        Index("ix_audit_recurso", "recurso", "recurso_id"),
        Index("ix_audit_usuario_data", "tenant_id", "usuario_id", "created_at"),
        Index("ix_audit_acao_data", "tenant_id", "acao", "created_at"),
        Index("ix_audit_request", "request_id"),
        {
            "postgresql_partition_by": "RANGE (created_at)",
            "comment": (
                "Trilha append-only particionada por mês; trigger bloqueia "
                "UPDATE/DELETE."
            ),
        },
    )

    # Necessário para a chave de particionamento RANGE (created_at) no PostgreSQL.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        primary_key=True,
        default=utcnow,
        nullable=False,
    )

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("organizacoes.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("usuarios.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        index=True,
    )
    usuario_nome: Mapped[str | None] = mapped_column(String(200), nullable=True)
    grupo_ativo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    estabelecimento_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)

    modulo: Mapped[str] = mapped_column(String(30), default="govsaude", nullable=False)
    acao: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    recurso: Mapped[str | None] = mapped_column(String(80), nullable=True)
    recurso_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    recurso_descricao: Mapped[str | None] = mapped_column(String(300), nullable=True)
    finalidade: Mapped[str | None] = mapped_column(String(300), nullable=True)
    resultado: Mapped[str] = mapped_column(String(20), default="SUCESSO", nullable=False)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    detalhe: Mapped[str | None] = mapped_column(Text, nullable=True)

    dados_antes: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    dados_depois: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    diff: Mapped[dict | None] = mapped_column(JSONType, nullable=True)

    ip: Mapped[str | None] = mapped_column(String(60), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    origem: Mapped[str | None] = mapped_column(String(40), nullable=True)


def _proibir_alteracao(*_args, **_kwargs):
    raise ValueError("A trilha de auditoria é append-only: UPDATE/DELETE proibidos.")


event.listen(AuditTrail, "before_update", _proibir_alteracao)
event.listen(AuditTrail, "before_delete", _proibir_alteracao)
