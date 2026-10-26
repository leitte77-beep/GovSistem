"""Outbox transacional e catálogo de integrações oficiais (B.12-059/060/061).

A gravação do registro de negócio e do envio ``PENDENTE`` acontecem na mesma
transação. Nenhuma chamada externa é feita dentro da transação do usuário.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    Base,
    JSONType,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    utcnow,
)
from app.models.enums import OperacaoEnvio, SituacaoEnvio


class IntegracaoSistema(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "integracao_sistemas"

    codigo: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class IntegracaoConfiguracao(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "integracao_configuracoes"
    __table_args__ = (
        Index("ix_integracao_config_tenant", "tenant_id", "sistema", "ativo"),
    )

    sistema: Mapped[str] = mapped_column(String(40), nullable=False)
    versao_layout: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ambiente: Mapped[str] = mapped_column(String(20), default="HOMOLOGACAO", nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    vigencia_inicio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    vigencia_fim: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parametros: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    credenciais_ref: Mapped[str | None] = mapped_column(String(200), nullable=True)


class IntegracaoEnvio(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin):
    __tablename__ = "integracao_envios"
    __table_args__ = (
        Index("ix_integracao_envios_tenant_estado", "tenant_id", "sistema", "situacao"),
        Index("ix_integracao_envios_registro", "tenant_id", "tipo_registro", "registro_id"),
        Index("ix_integracao_envios_prazo", "tenant_id", "competencia", "situacao"),
        Index("ix_integracao_envios_proxima", "situacao", "proxima_tentativa_em"),
        {"postgresql_partition_by": "RANGE (created_at)"},
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        primary_key=True,
        default=utcnow,
        nullable=False,
    )

    sistema: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    tipo_registro: Mapped[str] = mapped_column(String(60), nullable=False)
    registro_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    versao_registro: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    operacao: Mapped[str] = mapped_column(
        String(20), default=OperacaoEnvio.INCLUSAO.value, nullable=False
    )
    situacao: Mapped[str] = mapped_column(
        String(30), default=SituacaoEnvio.PENDENTE.value, nullable=False, index=True
    )
    tentativas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    proxima_tentativa_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    protocolo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    lote_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    payload_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload_ref: Mapped[str | None] = mapped_column(String(300), nullable=True)
    mensagens: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    competencia: Mapped[str | None] = mapped_column(String(6), nullable=True, index=True)
    enviado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aceito_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    erro_transitorio: Mapped[str | None] = mapped_column(Text, nullable=True)
