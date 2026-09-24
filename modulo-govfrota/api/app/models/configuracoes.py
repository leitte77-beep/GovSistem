import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ConfiguracaoGovFrota(Base, TimestampMixin):
    """Configurações do módulo GovFrota por organização (1:1 com tenant)."""

    __tablename__ = "govfrota_configuracoes"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Geral — adapta nomenclaturas (secretaria/unidade vs filial/empresa)
    tipo_organizacao: Mapped[str] = mapped_column(String(20), default="PUBLICO", nullable=False)
    nome_modulo: Mapped[str] = mapped_column(String(100), default="GovFrota", nullable=False)

    # Abastecimento do motorista
    foto_obrigatoria: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    foto_bomba_obrigatoria: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    foto_km_obrigatoria: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    exigir_tanque_cheio: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    permitir_retroativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    tolerancia_km_percentual: Mapped[int] = mapped_column(Integer(), default=20, nullable=False)
    alerta_consumo_desvio_pct: Mapped[int] = mapped_column(Integer(), default=30, nullable=False)
    bloquear_cnh_vencida: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)

    # Combustível / estoque
    permitir_estoque_negativo: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    exigir_nf_entrada: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    exigir_fornecedor_entrada: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    alerta_estoque_minimo_dias: Mapped[int] = mapped_column(Integer(), default=7, nullable=False)

    # Manutenção preventiva
    antecedencia_alerta_manutencao_dias: Mapped[int] = mapped_column(Integer(), default=15, nullable=False)
