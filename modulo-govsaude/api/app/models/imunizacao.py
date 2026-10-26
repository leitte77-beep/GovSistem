"""Imunização (Fase 9, B.7-001…013, B.7-024…029).

Esquemas vacinais são **dados versionados por vigência** do tenant: o motor
aplica faixa etária, sexo, ordem e intervalo entre doses e o aprazamento a
partir deles; nada de PNI codificado. Estoque e lotes são os da Fase 8; o
frasco multidose aberto tem saldo de doses e validade pós-abertura.
"""

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
    UniqueConstraint,
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
)


class Vacina(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin, BaixaMixin
):
    """B.7-001 — imunobiológico do tenant, ligado ao produto de estoque."""

    __tablename__ = "vacinas"
    __table_args__ = (UniqueConstraint("tenant_id", "codigo", name="uq_vacinas_codigo"),)
    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    nome: Mapped[str] = mapped_column(String(240), nullable=False)
    produto_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("produtos_estoque.id", ondelete="RESTRICT"), nullable=True
    )
    codigo_referencia: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fabricante: Mapped[str | None] = mapped_column(String(200), nullable=True)
    apresentacao: Mapped[str | None] = mapped_column(String(120), nullable=True)
    via: Mapped[str | None] = mapped_column(String(40), nullable=True)
    doses_por_frasco: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    validade_pos_abertura_horas: Mapped[int | None] = mapped_column(Integer, nullable=True)


class EsquemaVacinal(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    """B.7-001/011/029 — doses, idades, intervalos e sexo, com vigência.

    ``doses``: [{"dose": "D1", "ordem": 1, "idade_min_dias", "idade_max_dias",
    "intervalo_min_dias", "intervalo_recomendado_dias", "sexo"}]. ``origem``
    ``SEED_A_VALIDAR`` nasce inativo.
    """

    __tablename__ = "esquemas_vacinais"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", "numero_versao", name="uq_esquemas_versao"),
        CheckConstraint("acao_violacao IN ('ALERTAR','BLOQUEAR')", name="ck_esquemas_acao"),
    )
    vacina_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vacinas.id", ondelete="RESTRICT"), nullable=False
    )
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    numero_versao: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    vigencia_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    vigencia_fim: Mapped[date | None] = mapped_column(Date, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    origem: Mapped[str] = mapped_column(String(20), default="TENANT", nullable=False)
    fonte_normativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    acao_violacao: Mapped[str] = mapped_column(String(10), default="ALERTAR", nullable=False)
    doses: Mapped[list] = mapped_column(JSONType, nullable=False)


class FrascoAberto(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    """B.7-003/004/005 — frasco multidose: doses, prazo de uso e descarte."""

    __tablename__ = "frascos_abertos"
    __table_args__ = (
        Index("ix_frascos_local_situacao", "tenant_id", "local_id", "situacao"),
        CheckConstraint(
            "situacao IN ('ABERTO','ESGOTADO','DESCARTADO')", name="ck_frascos_situacao"
        ),
    )
    vacina_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vacinas.id", ondelete="RESTRICT"), nullable=False
    )
    local_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    lote_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("lotes_estoque.id", ondelete="RESTRICT"), nullable=False
    )
    aberto_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usar_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    doses_total: Mapped[int] = mapped_column(Integer, nullable=False)
    doses_aplicadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    doses_perdidas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    situacao: Mapped[str] = mapped_column(String(12), default="ABERTO", nullable=False)
    descartado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    descarte_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    descarte_automatico: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AgendamentoVacina(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    """B.7-006/007 — agendamento de vacina por cidadão, unidade, vacina e dose."""

    __tablename__ = "agendamentos_vacina"
    __table_args__ = (Index("ix_agend_vacina_cidadao", "tenant_id", "cidadao_id", "data_prevista"),)
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=False
    )
    vacina_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vacinas.id", ondelete="RESTRICT"), nullable=False
    )
    dose: Mapped[str] = mapped_column(String(20), nullable=False)
    data_prevista: Mapped[date] = mapped_column(Date, nullable=False)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    situacao: Mapped[str] = mapped_column(String(12), default="AGENDADO", nullable=False)
    aplicacao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    reagendado_para_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)


class AplicacaoVacina(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    """B.7-008/009/028 — registro nominal; externo não movimenta estoque."""

    __tablename__ = "aplicacoes_vacina"
    __table_args__ = (
        Index("ix_aplicacoes_cidadao", "tenant_id", "cidadao_id", "aplicada_em"),
        CheckConstraint("origem IN ('LOCAL','EXTERNA')", name="ck_aplicacoes_origem"),
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    vacina_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vacinas.id", ondelete="RESTRICT"), nullable=False
    )
    esquema_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("esquemas_vacinais.id", ondelete="RESTRICT"), nullable=True
    )
    dose: Mapped[str] = mapped_column(String(20), nullable=False)
    estrategia: Mapped[str | None] = mapped_column(String(60), nullable=True)
    aplicada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    origem: Mapped[str] = mapped_column(String(10), default="LOCAL", nullable=False)
    estabelecimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=True
    )
    local_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("locais_estoque.id", ondelete="RESTRICT"), nullable=True
    )
    lote_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("lotes_estoque.id", ondelete="RESTRICT"), nullable=True
    )
    frasco_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("frascos_abertos.id", ondelete="RESTRICT"), nullable=True
    )
    lote_externo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    local_externo: Mapped[str | None] = mapped_column(String(240), nullable=True)
    profissional_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True
    )
    agendamento_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    alertas: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    excecao_justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    situacao: Mapped[str] = mapped_column(String(12), default="ATIVA", nullable=False)
    retifica_de_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("aplicacoes_vacina.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    motivo_alteracao: Mapped[str | None] = mapped_column(Text, nullable=True)
