"""SIM-AM/TCE-PR — frota e combustível (Layout SIM-AM 2026, Patrimônio/Controle Interno).

O SIM-AM é uma camada de DERIVAÇÃO: os arquivos mensais são calculados do que o
GovFrota já registra (veículos, abastecimentos, entradas, estoque). As tabelas
daqui guardam só o que não existe em outro lugar:

- medidores físicos do veículo (o sequencial só muda na troca do aparelho);
- km/horas declarados com o medidor com defeito;
- saídas extraordinárias de estoque (perdas, oficina, obras, convênio);
- a competência mensal e o retrato do que foi fechado/enviado;
- o consumo enviado (sequencial imutável) e seus estornos.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class VeiculoMedidor(Base, TimestampMixin):
    """Hodômetro/horímetro físico instalado no veículo (nrSequencialHodoHori)."""

    __tablename__ = "veiculo_medidores"
    __table_args__ = (
        UniqueConstraint("veiculo_id", "sequencial", name="uq_veiculo_medidor_seq"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequencial: Mapped[int] = mapped_column(Integer(), nullable=False)
    tipo: Mapped[int] = mapped_column(Integer(), nullable=False)  # 1 hodômetro, 2 horímetro
    data_inicio: Mapped[date] = mapped_column(Date(), nullable=False)
    leitura_inicial: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    # Preenchidos na troca: última leitura do aparelho retirado.
    data_fim: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    leitura_final: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 3), nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    anexo_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class MedicaoDeclarada(Base, TimestampMixin):
    """Km/horas rodados com o medidor danificado (nrMedicaoDeclarada).

    Exige justificativa e documento firmado pelos responsáveis (manual SIM-AM).
    """

    __tablename__ = "medicoes_declaradas"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    medidor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("veiculo_medidores.id", ondelete="CASCADE"), nullable=False
    )
    data_referencia: Mapped[date] = mapped_column(Date(), nullable=False)
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    justificativa: Mapped[str] = mapped_column(String(250), nullable=False)
    anexo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    cancelada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_cancelamento: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)


class SaidaExtraCombustivel(Base, TimestampMixin):
    """Saída de estoque que não é abastecimento de veículo (SaidaExtraCombustivel).

    Debita o tanque por `aplicar_movimentacao` (origem SAIDA_EXTRA).
    """

    __tablename__ = "saidas_extra_combustivel"
    __table_args__ = (
        UniqueConstraint("organization_id", "ano", "numero", name="uq_saida_extra_numero"),
        Index("ix_saidas_extra_org_data", "organization_id", "data_saida"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer(), nullable=False)
    numero: Mapped[int] = mapped_column(Integer(), nullable=False)
    tanque_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tanques.id", ondelete="RESTRICT"), nullable=False
    )
    combustivel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id", ondelete="RESTRICT"), nullable=False
    )
    # 1 evaporação, 2 furto, 3 vazamento, 4 oficina, 5 obras/serviços, 6 convênio, 99 outras
    tipo_saida: Mapped[int] = mapped_column(Integer(), nullable=False)
    data_saida: Mapped[date] = mapped_column(Date(), nullable=False)
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    responsavel_cpf: Mapped[str] = mapped_column(String(11), nullable=False)
    nota_explicativa: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    recebedor_nome: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    recebedor_cpf_cnpj: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)
    convenio_numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    convenio_ano: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    convenio_objeto: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    anexo_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inventario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    movimentacao_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class SimamCompetencia(Base, TimestampMixin):
    """Mês de referência do SIM-AM. Sem registro = ABERTA.

    ABERTA → FECHADA (retrato congelado, lançamentos do mês travados)
    FECHADA → ABERTA (reabrir, com justificativa, enquanto não exportada)
    FECHADA → EXPORTADA (enviada ao TCE; correções viram estorno)
    """

    __tablename__ = "simam_competencias"
    __table_args__ = (
        UniqueConstraint("organization_id", "ano", "mes", name="uq_simam_competencia"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer(), nullable=False)
    mes: Mapped[int] = mapped_column(Integer(), nullable=False)
    status: Mapped[str] = mapped_column(String(15), default="ABERTA", nullable=False)
    # Linhas de cada arquivo no momento do fechamento (JSON {arquivo: [linhas]}).
    retrato_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    fechada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    fechada_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    exportada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    exportada_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    arquivo_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    historico_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)


class SimamConsumo(Base, TimestampMixin):
    """Linha de ConsumoCombustivel enviada. O sequencial nunca muda nem é reusado."""

    __tablename__ = "simam_consumos"
    __table_args__ = (
        UniqueConstraint("organization_id", "sequencial", name="uq_simam_consumo_seq"),
        UniqueConstraint(
            "organization_id", "ano", "mes", "veiculo_id", "combustivel_id", name="uq_simam_consumo_chave"
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequencial: Mapped[int] = mapped_column(Integer(), nullable=False)
    ano: Mapped[int] = mapped_column(Integer(), nullable=False)
    mes: Mapped[int] = mapped_column(Integer(), nullable=False)
    veiculo_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("veiculos.id"), nullable=False)
    combustivel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("combustiveis.id"), nullable=False
    )
    cd_bem: Mapped[str] = mapped_column(String(10), nullable=False)
    categoria: Mapped[int] = mapped_column(Integer(), nullable=False)
    objeto: Mapped[int] = mapped_column(Integer(), nullable=False)
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)


class SimamEstorno(Base, TimestampMixin):
    """EstornoConsumoCombustivel: redução de consumo de mês já enviado.

    Gerado automaticamente ao cancelar/reduzir abastecimento de competência
    EXPORTADA; sai no arquivo do mês (ano/mes) em que foi registrado.
    """

    __tablename__ = "simam_estornos"
    __table_args__ = (
        UniqueConstraint("organization_id", "ano", "numero", name="uq_simam_estorno_numero"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero: Mapped[int] = mapped_column(Integer(), nullable=False)
    ano: Mapped[int] = mapped_column(Integer(), nullable=False)
    mes: Mapped[int] = mapped_column(Integer(), nullable=False)
    consumo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("simam_consumos.id"), nullable=False
    )
    quantidade: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    motivo: Mapped[str] = mapped_column(String(250), nullable=False)
    abastecimento_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    usuario_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)


class SimamReferencia(Base):
    """Tabelas auxiliares do TCE (ModeloVeiculoFIPE, TipoObjetoDespesa...).

    Globais (não são por organização); importadas por `scripts/importar_tabelas_simam.py`.
    """

    __tablename__ = "simam_referencias"

    tabela: Mapped[str] = mapped_column(String(40), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(250), nullable=False)
    extra: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
