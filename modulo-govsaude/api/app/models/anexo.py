"""Anexos clínicos (B.12-054, B.6-029, B.3-012).

Imagem, PDF ou documento vinculado ao cidadão e, opcionalmente, a um
atendimento do PEC ou odontológico. Herda unidade e sigilo do contexto; o
binário fica no storage privado com chave opaca. Baixa é lógica.
"""

from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    BaixaMixin,
    Base,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class AnexoClinico(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin, BaixaMixin):
    __tablename__ = "anexos_clinicos"
    __table_args__ = (
        Index("ix_anexos_clinicos_cidadao", "tenant_id", "cidadao_id", "created_at"),
        CheckConstraint(
            "contexto IN ('CIDADAO','PRONTUARIO','ODONTOLOGIA')", name="ck_anexos_clinicos_contexto"
        ),
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    contexto: Mapped[str] = mapped_column(String(20), nullable=False)
    contexto_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    estabelecimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=True
    )
    classificacao: Mapped[str] = mapped_column(String(60), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    nome_arquivo: Mapped[str] = mapped_column(String(200), nullable=False)
    mime: Mapped[str] = mapped_column(String(100), nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    chave_objeto: Mapped[str] = mapped_column(String(300), nullable=False)
    status_antivirus: Mapped[str] = mapped_column(String(30), nullable=False)
    nivel_sigilo: Mapped[str] = mapped_column(String(30), default="NORMAL", nullable=False)
    especialidade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("especialidades.id", ondelete="RESTRICT"), nullable=True
    )
