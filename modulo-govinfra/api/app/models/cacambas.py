"""Gestão de caçambas municipais (itens 11 a 18).

Regras estruturais desta área:
  • a situação da caçamba é enumerada e controlada — nunca texto livre;
  • toda mudança de situação gera uma linha em `govinfra_dumpster_status_history`;
  • entrega e retirada são registros próprios, com foto, GPS e assinatura;
  • a caçamba não volta sozinha para "disponível" quando houve ocorrência.
"""

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    ActorMixin,
    Base,
    ConcurrencyMixin,
    Dinheiro,
    GeoMixin,
    JSONType,
    Quantidade,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import (
    DestinoRetirada,
    Prioridade,
    SituacaoCacamba,
    SituacaoSolicitacao,
)


class TipoResiduo(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Tipos de resíduo e materiais proibidos (configuráveis, item 48)."""

    __tablename__ = "govinfra_waste_types"
    __table_args__ = (UniqueConstraint("organizacao_id", "chave", name="uq_govinfra_residuo"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    proibido: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc="Material que não pode ser descartado na caçamba municipal",
    )
    exige_autorizacao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    destinacao_padrao: Mapped[str | None] = mapped_column(String(150), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ordem: Mapped[int] = mapped_column(default=0, nullable=False)


class Cacamba(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    ActorMixin,
    SoftDeleteMixin,
    ConcurrencyMixin,
    GeoMixin,
):
    """Caçamba do patrimônio municipal (item 11.1)."""

    __tablename__ = "govinfra_dumpsters"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "codigo", name="uq_govinfra_cacamba_codigo"),
        Index("ix_govinfra_cacamba_situacao", "organizacao_id", "situacao"),
        Index("ix_govinfra_cacamba_geo", "latitude", "longitude"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    patrimonio: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    identificacao_visual: Mapped[str | None] = mapped_column(
        String(60), nullable=True, doc="Número pintado na lateral, visível de longe"
    )
    tipo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    modelo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    capacidade_m3: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    comprimento_m: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    largura_m: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    altura_m: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    cor: Mapped[str | None] = mapped_column(String(40), nullable=True)

    data_aquisicao: Mapped[date | None] = mapped_column(Date, nullable=True)
    valor_aquisicao: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    estado_conservacao: Mapped[str | None] = mapped_column(String(40), nullable=True)

    localizacao_padrao: Mapped[str | None] = mapped_column(
        String(200), nullable=True, doc="Pátio ou depósito onde fica quando ociosa"
    )
    localizacao_atual: Mapped[str | None] = mapped_column(String(300), nullable=True)

    qr_code: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True, index=True)
    situacao: Mapped[str] = mapped_column(
        String(40), default=SituacaoCacamba.DISPONIVEL.value, nullable=False, index=True
    )
    ultima_vistoria_em: Mapped[date | None] = mapped_column(Date, nullable=True)
    proxima_vistoria_em: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    data_baixa: Mapped[date | None] = mapped_column(Date, nullable=True)
    motivo_baixa: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def disponivel(self) -> bool:
        return self.situacao == SituacaoCacamba.DISPONIVEL.value and self.deleted_at is None


class MovimentacaoCacamba(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, GeoMixin):
    """Histórico de situação da caçamba (item 11.3) — append-only."""

    __tablename__ = "govinfra_dumpster_status_history"
    __table_args__ = (Index("ix_govinfra_mov_cacamba", "cacamba_id", "created_at"),)

    cacamba_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpsters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    situacao_anterior: Mapped[str | None] = mapped_column(String(40), nullable=True)
    situacao_nova: Mapped[str] = mapped_column(String(40), nullable=False)
    localizacao_anterior: Mapped[str | None] = mapped_column(String(300), nullable=True)
    localizacao_nova: Mapped[str | None] = mapped_column(String(300), nullable=True)
    solicitacao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpster_requests.id", ondelete="SET NULL"), nullable=True, index=True
    )
    veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="SET NULL"), nullable=True
    )
    motivo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class SolicitacaoCacamba(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    ActorMixin,
    SoftDeleteMixin,
    ConcurrencyMixin,
    GeoMixin,
):
    """Solicitação de caçamba (itens 12 e 13)."""

    __tablename__ = "govinfra_dumpster_requests"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "ano", "protocolo", name="uq_govinfra_solicitacao_protocolo"),
        Index("ix_govinfra_solic_situacao", "organizacao_id", "situacao"),
        Index("ix_govinfra_solic_agenda", "organizacao_id", "data_agendada"),
        Index("ix_govinfra_solic_pessoa", "pessoa_id", "situacao"),
        Index("ix_govinfra_solic_geo", "latitude", "longitude"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Protocolo sequencial por ano — legível pelo cidadão (ex.: 2026/000123).
    ano: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    protocolo: Mapped[int] = mapped_column(Integer, nullable=False)
    protocolo_formatado: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    pessoa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_people.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    imovel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_properties.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Endereço de instalação — copiado do imóvel, mas editável (a caçamba pode
    # ficar na calçada de outro ponto do mesmo lote).
    logradouro: Mapped[str | None] = mapped_column(String(200), nullable=True)
    numero: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bairro: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    referencia: Mapped[str | None] = mapped_column(String(300), nullable=True)
    regiao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_regioes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    endereco_chave: Mapped[str | None] = mapped_column(String(300), nullable=True, index=True)
    instrucoes_entrega: Mapped[str | None] = mapped_column(Text, nullable=True)
    espaco_confirmado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acesso_caminhao_confirmado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_autorizacao_especial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    tipo_residuo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_waste_types.id", ondelete="SET NULL"), nullable=True, index=True
    )
    descricao_material: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantidade_estimada_m3: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    origem_material: Mapped[str | None] = mapped_column(String(200), nullable=True)
    materiais_adicionais: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    ciente_itens_proibidos: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    prioridade: Mapped[str] = mapped_column(
        String(20), default=Prioridade.NORMAL.value, nullable=False, index=True
    )
    data_desejada: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_agendada: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    data_prevista_entrega: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_prevista_retirada: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    dias_previstos: Mapped[int | None] = mapped_column(Integer, nullable=True)

    cacamba_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpsters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    motorista_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    equipe: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    atendente_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )

    situacao: Mapped[str] = mapped_column(
        String(40), default=SituacaoSolicitacao.RASCUNHO.value, nullable=False, index=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    termo_aceito: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    termo_aceito_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    motivo_reprovacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivo_cancelamento: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Justificativa exigida quando o atendente escolhe uma data mal pontuada
    # pelo motor de recomendação (item 15).
    justificativa_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Justificativa exigida quando um gestor libera apesar de bloqueio (item 10.4).
    justificativa_excecao: Mapped[str | None] = mapped_column(Text, nullable=True)

    cacamba: Mapped[Optional["Cacamba"]] = relationship(lazy="joined")
    entregas: Mapped[list["EntregaCacamba"]] = relationship(
        back_populates="solicitacao", cascade="all, delete-orphan"
    )
    retiradas: Mapped[list["RetiradaCacamba"]] = relationship(
        back_populates="solicitacao", cascade="all, delete-orphan"
    )

    @property
    def atrasada(self) -> bool:
        """Passou da data prevista de retirada e a caçamba ainda está no local."""
        if self.data_prevista_retirada is None:
            return False
        if self.situacao not in {
            SituacaoSolicitacao.EM_USO.value,
            SituacaoSolicitacao.AGUARDANDO_RETIRADA.value,
        }:
            return False
        return self.data_prevista_retirada < date.today()


class EntregaCacamba(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, GeoMixin):
    """Registro operacional da entrega (item 16) — preenchido no celular."""

    __tablename__ = "govinfra_dumpster_deliveries"

    solicitacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpster_requests.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    cacamba_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpsters.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="SET NULL"), nullable=True
    )
    motorista_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    auxiliares: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)

    saida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    km_saida: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    latitude_saida: Mapped[float | None] = mapped_column(nullable=True)
    longitude_saida: Mapped[float | None] = mapped_column(nullable=True)

    entregue_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    km_chegada: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    recebido_por: Mapped[str | None] = mapped_column(String(200), nullable=True)
    documento_recebedor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ocorrencias: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Entrega sem caçamba/veículo vinculados só com autorização registrada.
    contingencia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    justificativa_contingencia: Mapped[str | None] = mapped_column(Text, nullable=True)

    solicitacao: Mapped["SolicitacaoCacamba"] = relationship(back_populates="entregas")


class RetiradaCacamba(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, GeoMixin):
    """Registro operacional da retirada (item 17)."""

    __tablename__ = "govinfra_dumpster_pickups"

    solicitacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpster_requests.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    cacamba_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_dumpsters.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="SET NULL"), nullable=True
    )
    motorista_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    equipe: Mapped[str | None] = mapped_column(String(120), nullable=True)

    data_prevista: Mapped[date | None] = mapped_column(Date, nullable=True)
    retirada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    km_saida: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    km_chegada: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    tipo_material_encontrado: Mapped[str | None] = mapped_column(String(200), nullable=True)
    material_proibido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    descricao_material_proibido: Mapped[str | None] = mapped_column(Text, nullable=True)
    peso_kg: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    destinacao: Mapped[str | None] = mapped_column(String(200), nullable=True)

    ocorrencias: Mapped[str | None] = mapped_column(Text, nullable=True)
    necessita_limpeza: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    necessita_manutencao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    houve_dano: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Situação para onde a caçamba foi encaminhada (item 17).
    destino_cacamba: Mapped[str] = mapped_column(
        String(30), default=DestinoRetirada.DISPONIVEL.value, nullable=False
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    solicitacao: Mapped["SolicitacaoCacamba"] = relationship(back_populates="retiradas")
