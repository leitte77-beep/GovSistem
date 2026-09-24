"""Configuração do módulo por prefeitura: os setores.

O padrão de setores vem de `app.core.fluxo`; aqui fica só o que o município
personaliza. Não há mais configuração de trilha: o fluxo é vai e vem, e o
Assessor escolhe o destino a cada encaminhamento.
"""

import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Setor(Base, TimestampMixin):
    """Setor de uma prefeitura. `codigo` é estável; o nome pode ser editado."""

    __tablename__ = "setores"
    __table_args__ = (
        UniqueConstraint("organization_id", "codigo", name="uq_setor_org_codigo"),
        Index("ix_setores_org_ativo", "organization_id", "ativo"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    # Setor de sistema (a espera externa) não pode ser excluído.
    sistema: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    # Prazo sugerido ao encaminhar; vazio usa o padrão de app.core.fluxo.
    prazo_dias: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    # Quem responde pelo setor: é avisado quando chega tarefa sem dono.
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class Ajustes(Base, TimestampMixin):
    """Preferências da prefeitura no módulo. Uma linha por organização."""

    __tablename__ = "ajustes"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_ajustes_org"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    # A partir de quantos dias sem andar o pedido fica vermelho no painel.
    dias_alerta_parado: Mapped[int] = mapped_column(Integer(), nullable=False, default=15)
    # Resumo diário no sino do Prefeito.
    resumo_diario: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    # Hora (Brasília) a partir da qual o resumo sai, e para quais perfis.
    resumo_hora: Mapped[int] = mapped_column(Integer(), nullable=False, default=7)
    resumo_perfis: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: ["PREFEITO"])


class AuditoriaConfig(Base, TimestampMixin):
    """Quem mudou perfil, setor, acesso ou alerta — de quê para quê."""

    __tablename__ = "auditoria_config"
    __table_args__ = (Index("ix_auditoria_org_data", "organization_id", "created_at"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    autor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    autor_nome: Mapped[str] = mapped_column(String(180), nullable=False, default="")
    # USUARIO, SETOR, AJUSTES
    alvo_tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    alvo_nome: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    campo: Mapped[str] = mapped_column(String(40), nullable=False)
    antes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    depois: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
