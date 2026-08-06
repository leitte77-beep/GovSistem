"""Máquinas, equipamentos, veículos e habilitações (itens 27 a 29).

Pontos estruturais:
  • horímetro e odômetro têm histórico próprio e nunca podem retroceder sem
    permissão específica (`govinfra.medidores.corrigir`), sempre auditada;
  • a habilitação do operador/motorista é complemento do cadastro de servidor
    que já existe no sistema — não há segundo cadastro de pessoal;
  • RENAVAM é dado de acesso restrito, mascarado por padrão na API.
"""

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
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
    SituacaoEquipamento,
    SituacaoHabilitacao,
    TipoCombustivel,
    TipoMedidor,
)


class CategoriaMaquina(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Categoria de máquina (retroescavadeira, motoniveladora, ...)."""

    __tablename__ = "govinfra_machine_categories"
    __table_args__ = (UniqueConstraint("organizacao_id", "chave", name="uq_govinfra_cat_maquina"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    exige_cnh_categoria: Mapped[str | None] = mapped_column(String(10), nullable=True)
    exige_curso: Mapped[str | None] = mapped_column(String(120), nullable=True)
    consumo_medio_litros_hora: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ordem: Mapped[int] = mapped_column(default=0, nullable=False)


class Maquina(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    ActorMixin,
    SoftDeleteMixin,
    ConcurrencyMixin,
    GeoMixin,
):
    """Máquina ou equipamento pesado (item 27)."""

    __tablename__ = "govinfra_machines"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "codigo", name="uq_govinfra_maquina_codigo"),
        Index("ix_govinfra_maquina_situacao", "organizacao_id", "situacao"),
        Index("ix_govinfra_maquina_horimetro", "id", "horimetro_atual"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    patrimonio: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    categoria_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_machine_categories.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    tipo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    marca: Mapped[str | None] = mapped_column(String(80), nullable=True)
    modelo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ano: Mapped[int | None] = mapped_column(Integer, nullable=True)
    placa: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)
    chassi: Mapped[str | None] = mapped_column(String(40), nullable=True)
    numero_serie: Mapped[str | None] = mapped_column(String(60), nullable=True)

    horimetro_atual: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    capacidade: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tipo_combustivel: Mapped[str] = mapped_column(
        String(30), default=TipoCombustivel.DIESEL_S10.value, nullable=False
    )
    capacidade_tanque_litros: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    consumo_medio_litros_hora: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    localizacao_atual: Mapped[str | None] = mapped_column(String(300), nullable=True)
    data_aquisicao: Mapped[date | None] = mapped_column(Date, nullable=True)
    valor_aquisicao: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    situacao: Mapped[str] = mapped_column(
        String(40), default=SituacaoEquipamento.DISPONIVEL.value, nullable=False, index=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    data_baixa: Mapped[date | None] = mapped_column(Date, nullable=True)
    motivo_baixa: Mapped[str | None] = mapped_column(Text, nullable=True)

    categoria: Mapped[Optional["CategoriaMaquina"]] = relationship(lazy="joined")


class Veiculo(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    ActorMixin,
    SoftDeleteMixin,
    ConcurrencyMixin,
    GeoMixin,
):
    """Caminhão ou veículo de apoio (item 28)."""

    __tablename__ = "govinfra_vehicles"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "codigo", name="uq_govinfra_veiculo_codigo"),
        UniqueConstraint("organizacao_id", "placa", name="uq_govinfra_veiculo_placa"),
        Index("ix_govinfra_veiculo_situacao", "organizacao_id", "situacao"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    patrimonio: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    placa: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    # Dado restrito: só usuários com `govinfra.veiculos.ver_renavam` recebem
    # o valor completo; a API devolve mascarado para os demais.
    renavam: Mapped[str | None] = mapped_column(String(11), nullable=True)

    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    marca: Mapped[str | None] = mapped_column(String(80), nullable=True)
    modelo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ano: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    tipo_carroceria: Mapped[str | None] = mapped_column(String(80), nullable=True)
    capacidade: Mapped[str | None] = mapped_column(String(80), nullable=True)
    transporta_cacamba: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc="Habilita o veículo a ser sugerido para entrega/retirada de caçamba",
    )

    odometro_atual: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    tipo_combustivel: Mapped[str] = mapped_column(
        String(30), default=TipoCombustivel.DIESEL_S10.value, nullable=False
    )
    capacidade_tanque_litros: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    consumo_medio_km_litro: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    data_aquisicao: Mapped[date | None] = mapped_column(Date, nullable=True)
    valor_aquisicao: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    licenciamento_ate: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    seguro_ate: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    vencimentos: Mapped[dict | None] = mapped_column(
        JSONType, nullable=True, doc="Outros vencimentos (tacógrafo, ANTT, ...)"
    )

    localizacao_atual: Mapped[str | None] = mapped_column(String(300), nullable=True)
    situacao: Mapped[str] = mapped_column(
        String(40), default=SituacaoEquipamento.DISPONIVEL.value, nullable=False, index=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_baixa: Mapped[date | None] = mapped_column(Date, nullable=True)
    motivo_baixa: Mapped[str | None] = mapped_column(Text, nullable=True)


class LeituraMedidor(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Histórico de horímetro/odômetro (item 27 e 28).

    Toda leitura fica registrada, inclusive as correções para valor menor —
    estas exigem permissão e justificativa, e ficam marcadas como `correcao`.
    """

    __tablename__ = "govinfra_meter_readings"
    __table_args__ = (
        Index("ix_govinfra_medidor_maquina", "maquina_id", "created_at"),
        Index("ix_govinfra_medidor_veiculo", "veiculo_id", "created_at"),
    )

    maquina_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_machines.id", ondelete="CASCADE"), nullable=True, index=True
    )
    veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="CASCADE"), nullable=True, index=True
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default=TipoMedidor.HORIMETRO.value)
    valor_anterior: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    valor: Mapped[float] = mapped_column(Quantidade, nullable=False)
    origem: Mapped[str] = mapped_column(
        String(40), nullable=False, default="apontamento",
        doc="apontamento | abastecimento | manutencao | correcao",
    )
    correcao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    ordem_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_work_orders.id", ondelete="SET NULL"), nullable=True
    )


class Habilitacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    """Complemento de habilitações do servidor (item 29).

    Aponta para o usuário já provisionado da plataforma — não recria o cadastro
    de servidor. Guarda CNH, cursos e as máquinas/veículos autorizados.
    """

    __tablename__ = "govinfra_operator_qualifications"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "user_id", name="uq_govinfra_habilitacao_user"),
        Index("ix_govinfra_habilitacao_cnh", "organizacao_id", "cnh_validade"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    funcao: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cnh_numero: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cnh_categoria: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cnh_validade: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    # Cursos/certificações: [{"nome": "NR-11", "validade": "2027-05-01"}]
    cursos: Mapped[list[dict] | None] = mapped_column(JSONType, nullable=True)
    # Autorizações explícitas — sem elas o agendamento é recusado.
    categorias_autorizadas: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    maquinas_autorizadas: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    veiculos_autorizados: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    opera_maquinas: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dirige_veiculos: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    jornada_inicio: Mapped[str | None] = mapped_column(String(5), nullable=True, doc="HH:MM")
    jornada_fim: Mapped[str | None] = mapped_column(String(5), nullable=True, doc="HH:MM")
    jornada_maxima_horas: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    escala: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Afastamentos: [{"inicio": "...", "fim": "...", "motivo": "férias"}]
    afastamentos: Mapped[list[dict] | None] = mapped_column(JSONType, nullable=True)

    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoHabilitacao.ATIVA.value, nullable=False, index=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def cnh_vencida(self, referencia: date | None = None) -> bool:
        if self.cnh_validade is None:
            return False
        return self.cnh_validade < (referencia or date.today())

    def afastado_em(self, momento: datetime | date) -> bool:
        alvo = momento.date() if isinstance(momento, datetime) else momento
        for afastamento in self.afastamentos or []:
            inicio = afastamento.get("inicio")
            fim = afastamento.get("fim")
            if not inicio:
                continue
            try:
                inicio_d = date.fromisoformat(str(inicio)[:10])
                fim_d = date.fromisoformat(str(fim)[:10]) if fim else date.max
            except ValueError:
                continue
            if inicio_d <= alvo <= fim_d:
                return True
        return False
