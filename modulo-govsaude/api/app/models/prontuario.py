"""PEC ambulatorial (Fase 5, B.6-004…058, B.12-013/021…025).

SOAP e documentos ficam cifrados em repouso. Nada é excluído: problema e
alergia são encerrados com motivo; evolução e registro assinados só mudam por
retificação encadeada (B.6-057).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, Uuid
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


class ProblemaClinico(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    __tablename__ = "problemas_clinicos"
    __table_args__ = (Index("ix_problemas_clinicos_cidadao", "tenant_id", "cidadao_id", "ativo"),)
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    sistema: Mapped[str] = mapped_column(String(10), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    validado_referencia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    encerrado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    encerrado_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)


class Alergia(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    """B.6-015 — alergia/intolerância; alimenta o alerta da prescrição."""

    __tablename__ = "alergias"
    __table_args__ = (Index("ix_alergias_cidadao", "tenant_id", "cidadao_id", "ativo"),)
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    categoria: Mapped[str] = mapped_column(String(20), nullable=False)
    agente_codigo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    agente_descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    criticidade: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    encerrado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    encerrado_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)


class PlanoCuidado(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    __tablename__ = "planos_cuidado"
    atendimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("atendimentos.id", ondelete="RESTRICT"), nullable=False
    )
    objetivo: Mapped[str] = mapped_column(Text, nullable=False)
    acoes: Mapped[dict] = mapped_column(JSONType, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ATIVO", nullable=False)


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
