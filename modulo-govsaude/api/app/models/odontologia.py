"""Odontologia (Fase 7, B.3-001…027).

Catálogo de condições/procedimentos é dado do tenant (cor, aplicabilidade,
SIGTAP). O odontograma é versionado e imutável: cada gravação cria uma nova
versão e preserva a anterior (B.3-006/024, regra 3 do prompt).
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

from app.core.encryption import CampoProtegido
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


class OdontoCondicao(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    TenantMixin,
    VersaoMixin,
    VigenciaMixin,
    BaixaMixin,
    ActorMixin,
):
    """B.3-001 — condição ou procedimento odontológico com cor e aplicabilidade."""

    __tablename__ = "odonto_condicoes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_odonto_condicoes_codigo"),
        CheckConstraint("tipo IN ('CONDICAO','PROCEDIMENTO')", name="ck_odonto_condicoes_tipo"),
        CheckConstraint(
            "denticao IN ('PERMANENTE','DECIDUA','AMBAS')", name="ck_odonto_condicoes_denticao"
        ),
    )
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    cor: Mapped[str | None] = mapped_column(String(7), nullable=True)
    # Subconjunto de DENTE, FACE, SEXTANTE, ARCADA, BOCA.
    aplicavel_a: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    denticao: Mapped[str] = mapped_column(String(12), default="AMBAS", nullable=False)
    procedimento_sigtap: Mapped[str | None] = mapped_column(String(10), nullable=True)


class Odontograma(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    """B.3-006/024 — versão imutável do odontograma do cidadão."""

    __tablename__ = "odontogramas"
    __table_args__ = (
        UniqueConstraint("tenant_id", "cidadao_id", "numero_versao", name="uq_odontogramas_versao"),
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    numero_versao: Mapped[int] = mapped_column(Integer, nullable=False)
    atendimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("odonto_atendimentos.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    # [{"dente", "faces": [...], "regiao", "condicao_id", "situacao": EXISTENTE|PLANEJADO|REALIZADO, "observacao"}]
    marcacoes: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)


class OdontoAtendimento(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    """B.3-003/004/005/009/010/013 — atendimento odontológico."""

    __tablename__ = "odonto_atendimentos"
    __table_args__ = (
        Index("ix_odonto_atendimentos_cidadao", "tenant_id", "cidadao_id", "iniciado_em"),
        Index("ix_odonto_atendimentos_estab", "tenant_id", "estabelecimento_id", "iniciado_em"),
        CheckConstraint(
            "situacao IN ('ABERTO','FINALIZADO','CANCELADO')",
            name="ck_odonto_atendimentos_situacao",
        ),
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    estabelecimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=False
    )
    profissional_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True
    )
    agendamento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("agendamentos.id", ondelete="SET NULL"), nullable=True
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    situacao: Mapped[str] = mapped_column(String(12), default="ABERTO", nullable=False)
    iniciado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finalizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    formulario_anamnese_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("formularios_dinamicos.id", ondelete="SET NULL"), nullable=True
    )
    versao_formulario: Mapped[int | None] = mapped_column(Integer, nullable=True)
    anamnese: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    triagem: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    classificacao_risco: Mapped[str | None] = mapped_column(String(40), nullable=True)
    evolucao: Mapped[str | None] = mapped_column(CampoProtegido, nullable=True)
    retroativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    retroativo_justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelamento_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)


class OdontoProcedimento(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    """B.3-011/018/022 — procedimento programado ou realizado por dente/face."""

    __tablename__ = "odonto_procedimentos"
    __table_args__ = (
        Index("ix_odonto_procedimentos_cidadao", "tenant_id", "cidadao_id", "situacao"),
        Index("ix_odonto_procedimentos_realizado", "tenant_id", "realizado_em", "dente"),
        CheckConstraint(
            "situacao IN ('PROGRAMADO','REALIZADO','CANCELADO')",
            name="ck_odonto_procedimentos_situacao",
        ),
        CheckConstraint("quantidade >= 1", name="ck_odonto_procedimentos_quantidade"),
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    atendimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("odonto_atendimentos.id", ondelete="RESTRICT"), nullable=True
    )
    condicao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("odonto_condicoes.id", ondelete="RESTRICT"), nullable=True
    )
    procedimento_sigtap: Mapped[str | None] = mapped_column(String(10), nullable=True)
    dente: Mapped[int | None] = mapped_column(Integer, nullable=True)
    faces: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    regiao: Mapped[str | None] = mapped_column(String(20), nullable=True)
    situacao: Mapped[str] = mapped_column(String(12), default="PROGRAMADO", nullable=False)
    quantidade: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    programado_para: Mapped[date | None] = mapped_column(Date, nullable=True)
    realizado_em: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Insumos consumidos; a baixa no estoque entra com a Fase 8 (B.3 × B.4).
    insumos: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    cancelamento_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)


class OdontoDocumento(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, BaixaMixin, ActorMixin
):
    """B.3-014 — documento emitido no atendimento odontológico."""

    __tablename__ = "odonto_documentos"
    __table_args__ = (
        Index("ix_odonto_documentos_atendimento", "tenant_id", "atendimento_id"),
        CheckConstraint(
            "tipo IN ('ATESTADO','DECLARACAO','RECEITA','ORIENTACAO','ENCAMINHAMENTO','OUTRO')",
            name="ck_odonto_documentos_tipo",
        ),
    )
    atendimento_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("odonto_atendimentos.id", ondelete="RESTRICT"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    conteudo: Mapped[str] = mapped_column(CampoProtegido, nullable=False)
    emitido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
