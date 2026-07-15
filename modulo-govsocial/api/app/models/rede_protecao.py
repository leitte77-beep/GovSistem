"""Notificacoes Intersetoriais (CDXXIV-CDXXVIII), Revelacao Espontanea (CDXXIX-CDXXXIII),
Acompanhamento Rede de Protecao (CDXXXIV-CDXXXVII) — Fases 3.19, 3.20, 3.21."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base, TimestampMixin, SoftDeleteMixin

# ARRAY é do dialeto Postgres e não compila em SQLite (usado nos testes).
LISTA_TEXTO = ARRAY(String).with_variant(JSON, "sqlite")


class NotificacaoIntersetorial(Base, TimestampMixin, SoftDeleteMixin):
    """Notificacao intersetorial entre areas (CDXXIV-CDXXVIII)."""

    __tablename__ = "notificacoes_intersetoriais"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    attendance_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    person_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    family_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    descricao_caso: Mapped[str] = mapped_column(Text, nullable=False)
    acoes_realizadas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    area_origem: Mapped[str] = mapped_column(String(100), nullable=False)
    area_destino: Mapped[str] = mapped_column(String(100), nullable=False)
    sensivel: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    especialidades_permitidas: Mapped[Optional[list]] = mapped_column(LISTA_TEXTO, nullable=True)
    unidades_permitidas: Mapped[Optional[list]] = mapped_column(LISTA_TEXTO, nullable=True)
    registrado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)


class RevelacaoEspontanea(Base, TimestampMixin):
    """Registro de revelacao espontanea conforme Lei 13.431/2017 (CDXXIX-CDXXXIII)."""

    __tablename__ = "revelacoes_espontaneas"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    unit_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False)
    profissional_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    data_hora: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    vitima_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    vitima_nome: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    matriculada_ensino: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    suposto_indicador_violencia: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vinculo_suposto_autor: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    encaminhamentos: Mapped[Optional[list]] = mapped_column(LISTA_TEXTO, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    registrado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)


class AcompanhamentoRedeProtecao(Base, TimestampMixin, SoftDeleteMixin):
    """Acompanhamento pela Rede de Protecao (CDXXXIV-CDXXXVII)."""

    __tablename__ = "acompanhamentos_rede_protecao"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    person_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    family_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
    data_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data_fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    registrado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
