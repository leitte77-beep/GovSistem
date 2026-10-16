import uuid
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, LargeBinary, String
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

    # Abastecimento do motorista
    foto_bomba_obrigatoria: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    foto_km_obrigatoria: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    exigir_tanque_cheio: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    permitir_retroativo: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    tolerancia_km_percentual: Mapped[int] = mapped_column(Integer(), default=20, nullable=False)
    alerta_consumo_desvio_pct: Mapped[int] = mapped_column(Integer(), default=30, nullable=False)
    # Alertas de conferência (não bloqueiam): horário permitido ("HH:MM",
    # fuso da organização; vazio = sem restrição) e litros acima da média.
    horario_abastecimento_inicio: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    horario_abastecimento_fim: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    alerta_litros_acima_media_pct: Mapped[int] = mapped_column(Integer(), default=50, nullable=False)
    bloquear_cnh_vencida: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)

    # Combustível / estoque
    permitir_estoque_negativo: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    exigir_nf_entrada: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    exigir_fornecedor_entrada: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)
    # Nota do posto com preço/L acima do contrato: sempre avisa; bloqueia só se o município ligar.
    bloquear_nota_preco_acima_contrato: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    alerta_estoque_minimo_dias: Mapped[int] = mapped_column(Integer(), default=7, nullable=False)

    # Manutenção preventiva
    antecedencia_alerta_manutencao_dias: Mapped[int] = mapped_column(Integer(), default=15, nullable=False)

    # SIM-AM/TCE-PR: código da entidade (idPessoa) e CPF do servidor
    # responsável pelo controle do combustível (padrão das entradas/saídas).
    simam_id_pessoa: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    simam_cpf_responsavel: Mapped[Optional[str]] = mapped_column(String(11), nullable=True)

    # PDF dos relatórios (migration 028): cabeçalho centralizado com logo e
    # textos, faixa colorida no topo e rodapé. Vazio = padrão (nome do órgão).
    pdf_titulo: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    pdf_subtitulo: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    pdf_linha_extra: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    pdf_rodape: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    pdf_cor_primaria: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    pdf_cor_secundaria: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    pdf_logo: Mapped[Optional[bytes]] = mapped_column(LargeBinary(), nullable=True, deferred=True)
    pdf_logo_tipo: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    @property
    def pdf_tem_logo(self) -> bool:
        return bool(self.pdf_logo_tipo)
