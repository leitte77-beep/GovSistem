"""PEC ambulatorial (Fase 5, B.6-004…058).

SOAP fica cifrado em repouso. Alergias e problemas/condições são os do cadastro
do cidadão (``cidadao_alergias``/``cidadao_condicoes``, Fase 2): o PEC não
duplica a lista. Evolução e registro assinados só mudam por retificação
encadeada (B.6-057).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encryption import CampoProtegido
from app.models.base import (
    ActorMixin,
    Base,
    JSONType,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    VersaoMixin,
)


class Atendimento(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    __tablename__ = "atendimentos"
    __table_args__ = (
        Index("ix_atendimentos_tenant_cidadao", "tenant_id", "cidadao_id", "iniciado_em"),
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    estabelecimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="SET NULL"), nullable=True
    )
    profissional_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="ABERTO", nullable=False)
    etapa: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tipo: Mapped[str] = mapped_column(String(40), default="CONSULTA", nullable=False)
    dados_triagem: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    classificacao_risco: Mapped[str | None] = mapped_column(String(40), nullable=True)
    retroativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    justificativa_retroativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    iniciado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finalizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sigiloso: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # B.6-035 — NORMAL, RESTRITO_ESPECIALIDADE (só a especialidade autorizada) ou SIGILOSO.
    nivel_sigilo: Mapped[str] = mapped_column(String(30), default="NORMAL", nullable=False)
    especialidade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("especialidades.id", ondelete="RESTRICT"), nullable=True
    )
    # B.6-004 — atendimento aberto a partir da fila (recepção → triagem → consulta).
    fila_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("filas_atendimento.id", ondelete="RESTRICT"), nullable=True, unique=True
    )


class EvolucaoSOAP(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    __tablename__ = "evolucoes_soap"
    __table_args__ = (Index("ix_evolucoes_soap_atendimento", "tenant_id", "atendimento_id"),)
    atendimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("atendimentos.id", ondelete="RESTRICT"), nullable=False
    )
    subjetivo: Mapped[str | None] = mapped_column(CampoProtegido, nullable=True)
    objetivo: Mapped[str | None] = mapped_column(CampoProtegido, nullable=True)
    avaliacao: Mapped[str | None] = mapped_column(CampoProtegido, nullable=True)
    plano: Mapped[str | None] = mapped_column(CampoProtegido, nullable=True)
    assinado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retifica_de_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("evolucoes_soap.id", ondelete="SET NULL", use_alter=True), nullable=True
    )


class SinalVital(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    __tablename__ = "sinais_vitais"
    __table_args__ = (
        Index("ix_sinais_vitais_cidadao_data", "tenant_id", "cidadao_id", "created_at"),
    )
    atendimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("atendimentos.id", ondelete="RESTRICT"), nullable=False
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    dados: Mapped[dict] = mapped_column(JSONType, nullable=False)


class PlanoCuidado(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    __tablename__ = "planos_cuidado"
    atendimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("atendimentos.id", ondelete="RESTRICT"), nullable=False
    )
    objetivo: Mapped[str] = mapped_column(Text, nullable=False)
    acoes: Mapped[dict] = mapped_column(JSONType, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ATIVO", nullable=False)
    vigencia_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    vigencia_fim: Mapped[date | None] = mapped_column(Date, nullable=True)


class Prescricao(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    __tablename__ = "prescricoes"
    __table_args__ = (Index("ix_prescricoes_cidadao", "tenant_id", "cidadao_id", "created_at"),)
    atendimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("atendimentos.id", ondelete="RESTRICT"), nullable=False
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    itens: Mapped[list] = mapped_column(JSONType, nullable=False)
    alertas: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    assinada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    copiada_de_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("prescricoes.id", ondelete="SET NULL", use_alter=True), nullable=True
    )


class RegistroAssistencial(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    """Ato clínico estruturado; protocolos e catálogos são configurados pelo tenant."""

    __tablename__ = "registros_assistenciais"
    __table_args__ = (
        Index(
            "ix_registros_assistenciais_cidadao", "tenant_id", "cidadao_id", "tipo", "created_at"
        ),
        Index("ix_registros_assistenciais_atendimento", "tenant_id", "atendimento_id"),
    )
    atendimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("atendimentos.id", ondelete="RESTRICT"), nullable=True
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    estabelecimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="SET NULL"), nullable=True
    )
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ATIVO", nullable=False)
    dados: Mapped[dict] = mapped_column(JSONType, nullable=False)
    sigiloso: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    nivel_sigilo: Mapped[str] = mapped_column(String(30), default="NORMAL", nullable=False)
    especialidade_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("especialidades.id", ondelete="RESTRICT"), nullable=True
    )
    formulario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("formularios_dinamicos.id", ondelete="SET NULL"), nullable=True
    )
    versao_formulario: Mapped[int | None] = mapped_column(nullable=True)
    retificacao_justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    assinado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retifica_de_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("registros_assistenciais.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
