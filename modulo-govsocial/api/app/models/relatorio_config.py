"""RelatorioConfig — Configuracao de relatorios customizaveis (Fase 3.17)."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, SoftDeleteMixin


class RelatorioConfig(Base, TimestampMixin, SoftDeleteMixin):
    """Configuracao de relatorio personalizado pelo tenant."""

    __tablename__ = "relatorios_config"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment="Lista de tags para busca")
    grupo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    icone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    fonte_dados: Mapped[dict] = mapped_column(JSON, nullable=False, comment=(
        "{tipo: 'sql'|'assistente', sql: str, tabelas: [...], joins: [...]}"
    ))
    colunas: Mapped[list] = mapped_column(JSON, nullable=False, comment=(
        "[{campo: str, titulo: str, alinhamento: str, largura: int, ordenavel: bool}]"
    ))
    filtros: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment=(
        "[{campo: str, titulo: str, tipo: 'texto'|'data'|'select'|'numero', obrigatorio: bool, valor_padrao: any, opcoes: [...]}]"
    ))
    agrupamentos: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment=(
        "[{campo: str, titulo: str, mostrar_totais: bool, mostrar_porcentagem: bool}]"
    ))
    ordenacao: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment=(
        "[{campo: str, direcao: 'asc'|'desc'}]"
    ))
    layout: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment=(
        "{orientacao: 'retrato'|'paisagem', tamanho: 'A4'|'Carta', margens: {top, right, bottom, left}, zebrado: bool}"
    ))
    permissoes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment="Lista de role names com acesso")
    compartilhado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    criado_por_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=True), nullable=True)
