"""Território, famílias, domicílios e visitas domiciliares (Fase 3)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    BaixaMixin,
    Base,
    JSONType,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    VersaoMixin,
    VigenciaMixin,
)


class Territorio(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin, ActorMixin
):
    """Área ou microárea territorial. Geometria é GeoJSON validado no serviço."""

    __tablename__ = "territorios"
    __table_args__ = (
        Index("ix_territorios_tenant_tipo_nome", "tenant_id", "tipo", "nome"),
        CheckConstraint("tipo IN ('AREA','MICROAREA')", name="ck_territorios_tipo"),
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    codigo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    tipo: Mapped[str] = mapped_column(String(12), nullable=False)
    territorio_pai_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("territorios.id", ondelete="RESTRICT", use_alter=True), nullable=True
    )
    equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("equipes.id", ondelete="SET NULL"), nullable=True
    )
    geometria: Mapped[dict | None] = mapped_column(JSONType, nullable=True)


class Familia(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin, ActorMixin
):
    __tablename__ = "familias"
    __table_args__ = (Index("ix_familias_tenant_codigo", "tenant_id", "codigo"),)
    codigo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="SET NULL"), nullable=True
    )
    risco: Mapped[str | None] = mapped_column(String(40), nullable=True)
    risco_justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)


class Domicilio(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, BaixaMixin, ActorMixin
):
    __tablename__ = "domicilios"
    __table_args__ = (
        Index("ix_domicilios_tenant_endereco", "tenant_id", "logradouro", "numero"),
        Index("ix_domicilios_territorio", "tenant_id", "territorio_id"),
    )
    territorio_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("territorios.id", ondelete="SET NULL"), nullable=True
    )
    cep: Mapped[str | None] = mapped_column(String(8), nullable=True)
    logradouro: Mapped[str] = mapped_column(String(240), nullable=False)
    numero: Mapped[str | None] = mapped_column(String(30), nullable=True)
    complemento: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bairro: Mapped[str | None] = mapped_column(String(120), nullable=True)
    distrito: Mapped[str | None] = mapped_column(String(120), nullable=True)
    municipio_ibge: Mapped[str | None] = mapped_column(String(7), nullable=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    tipo_imovel: Mapped[str | None] = mapped_column(String(50), nullable=True)
    situacao: Mapped[str] = mapped_column(String(30), default="ATIVO", nullable=False)


class FamiliaDomicilio(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VigenciaMixin, ActorMixin
):
    __tablename__ = "familias_domicilios"
    __table_args__ = (
        Index(
            "ix_familias_domicilios_ativo",
            "tenant_id",
            "familia_id",
            "domicilio_id",
            "vigencia_fim",
        ),
    )
    familia_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("familias.id", ondelete="RESTRICT"), nullable=False
    )
    domicilio_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("domicilios.id", ondelete="RESTRICT"), nullable=False
    )


class FamiliaMembro(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VigenciaMixin, ActorMixin
):
    __tablename__ = "familias_membros"
    __table_args__ = (
        Index("ix_familias_membros_cidadao", "tenant_id", "cidadao_id", "vigencia_fim"),
    )
    familia_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("familias.id", ondelete="RESTRICT"), nullable=False
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    parentesco: Mapped[str | None] = mapped_column(String(60), nullable=True)
    responsavel: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AnimalDomicilio(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, BaixaMixin, ActorMixin
):
    """Cadastro flexível; espécies e atributos pertencem à configuração do tenant."""

    __tablename__ = "animais_domicilio"
    __table_args__ = (Index("ix_animais_domicilio_tenant_domicilio", "tenant_id", "domicilio_id"),)
    domicilio_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("domicilios.id", ondelete="RESTRICT"), nullable=False
    )
    especie: Mapped[str] = mapped_column(String(80), nullable=False)
    quantidade: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    atributos: Mapped[dict | None] = mapped_column(JSONType, nullable=True)


class VisitaDomiciliar(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    __tablename__ = "visitas_domiciliares"
    __table_args__ = (
        Index("ix_visitas_domiciliares_tenant_data", "tenant_id", "realizada_em"),
        Index("ix_visitas_domiciliares_cidadao", "tenant_id", "cidadao_id", "competencia"),
    )
    domicilio_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("domicilios.id", ondelete="RESTRICT"), nullable=False
    )
    cidadao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="SET NULL"), nullable=True
    )
    familia_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("familias.id", ondelete="SET NULL"), nullable=True
    )
    profissional_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True
    )
    realizada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    competencia: Mapped[date] = mapped_column(Date, nullable=False)
    turno: Mapped[str] = mapped_column(String(15), default="MANHA", nullable=False)
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    precisao_metros: Mapped[float | None] = mapped_column(nullable=True)
    justificativa_gps: Mapped[str | None] = mapped_column(Text, nullable=True)
    resultado: Mapped[str | None] = mapped_column(String(80), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assinatura_nome: Mapped[str | None] = mapped_column(String(200), nullable=True)
    motivos: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    busca_ativa: Mapped[bool] = mapped_column(default=False, nullable=False)
    acompanhamento: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    controle_ambiental: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    medicoes: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    desfecho: Mapped[str | None] = mapped_column(String(60), nullable=True)
    assinatura_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
