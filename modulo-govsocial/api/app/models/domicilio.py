import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class DadosDomicilio(Base, TimestampMixin):
    """Dados de infraestrutura do domicilio conforme formulario CadUnico."""

    __tablename__ = "dados_domicilio"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    tipo_construcao: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Alvenaria | Madeira | Mista | Taipa | Outro"
    )
    abastecimento_agua: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Rede_geral | Poco | Cisterna | Carro_pipa | Outro"
    )
    iluminacao_eletrica: Mapped[Optional[bool]] = mapped_column(nullable=True)
    destino_lixo: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Coleta_direta | Coleta_indireta | Queimado | Ceu_aberto | Enterrado | Outro"
    )
    escoamento_sanitario: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Rede_esgoto | Fossa_septica | Fossa_rudimentar | Vala | Ceu_aberto | Outro"
    )
    total_comodos: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_dormitorios: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tipo_domicilio: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Particular_permanente | Particular_improvisado | Coletivo"
    )
    acesso_pavimentacao: Mapped[Optional[bool]] = mapped_column(nullable=True)
    material_piso: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Ceramica | Cimento | Madeira | Terra | Outro"
    )
    total_pessoas: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_mulheres_gravidas: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=0,
    )
    total_maes_amamentando: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=0,
    )
    total_pessoas_deficiencia: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=0,
    )
    total_idosos: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=0,
    )
    observacoes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    family = relationship("Family", backref="dados_domicilio")
