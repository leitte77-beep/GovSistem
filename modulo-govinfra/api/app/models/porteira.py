"""Programa Porteira Adentro (itens 19 a 36).

Nenhum limite legal está fixado em código: prazos, quantidade de horas, regra
por CPF ou por propriedade, método de desconto e critérios de aprovação vivem em
`govinfra_programs`, editáveis pelo gestor. O que o código garante é a
integridade: saldo nunca muda sem movimentação correspondente, e o total de
horas de uma ordem é sempre a soma dos apontamentos individuais.
"""

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
    MetodoDesconto,
    Prioridade,
    SituacaoBeneficiario,
    SituacaoHorasAdicionais,
    SituacaoOrdem,
    SituacaoServico,
    TipoApontamento,
    TipoMovimentoHoras,
)


class Programa(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    """Edição do programa, com todas as regras configuráveis (item 19)."""

    __tablename__ = "govinfra_programs"
    __table_args__ = (UniqueConstraint("organizacao_id", "chave", name="uq_govinfra_programa"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_legal: Mapped[str | None] = mapped_column(
        String(300), nullable=True,
        doc="Lei/decreto municipal que fundamenta os limites — preenchido pelo gestor",
    )

    vigencia_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    vigencia_fim: Mapped[date | None] = mapped_column(Date, nullable=True)

    horas_por_beneficiario: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    horas_por_propriedade: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    # Como o limite é contado: cpf | propriedade | ambos
    regra_limite: Mapped[str] = mapped_column(String(20), default="cpf", nullable=False)
    metodo_desconto: Mapped[str] = mapped_column(
        String(30), default=MetodoDesconto.GERAL.value, nullable=False
    )
    validade_saldo_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    permite_horas_adicionais: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    limite_horas_adicionais: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    exige_vistoria: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_aprovacao_gestor: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    permite_cobranca: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    valor_hora_excedente: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)

    documentos_obrigatorios: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    servicos_permitidos: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    equipamentos_permitidos: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    criterios_prioridade: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    pesos_recomendacao: Mapped[dict | None] = mapped_column(JSONType, nullable=True)

    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    def vigente_em(self, referencia: date) -> bool:
        if not self.ativo:
            return False
        if referencia < self.vigencia_inicio:
            return False
        return self.vigencia_fim is None or referencia <= self.vigencia_fim


class Beneficiario(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin):
    """Produtor inscrito no programa (item 20)."""

    __tablename__ = "govinfra_program_beneficiaries"
    __table_args__ = (
        UniqueConstraint("programa_id", "pessoa_id", name="uq_govinfra_beneficiario"),
        Index("ix_govinfra_beneficiario_situacao", "organizacao_id", "situacao"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    programa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pessoa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_people.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    classificacao: Mapped[str | None] = mapped_column(String(60), nullable=True)
    atividade_produtiva: Mapped[str | None] = mapped_column(String(200), nullable=True)
    data_entrada: Mapped[date] = mapped_column(Date, nullable=False)
    validade_ate: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoBeneficiario.ATIVO.value, nullable=False, index=True
    )
    pendencias: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class SaldoHoras(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, ConcurrencyMixin):
    """Saldo do banco de horas (item 25.1).

    Um saldo por (beneficiário, propriedade opcional, categoria opcional,
    período). A soma é sempre reconstituível pelas movimentações — os campos
    agregados existem só para leitura rápida.
    """

    __tablename__ = "govinfra_hour_balances"
    __table_args__ = (
        UniqueConstraint(
            "beneficiario_id", "imovel_id", "categoria", "periodo_referencia",
            name="uq_govinfra_saldo_horas",
        ),
        CheckConstraint(
            "horas_concedidas >= 0 AND horas_reservadas >= 0 AND horas_utilizadas >= 0",
            name="ck_govinfra_saldo_nao_negativo",
        ),
        Index("ix_govinfra_saldo_beneficiario", "beneficiario_id", "periodo_referencia"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    programa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    beneficiario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_program_beneficiaries.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    imovel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_properties.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Preenchido apenas no método `por_categoria` — saldos separados por tipo
    # de equipamento. String vazia representa "sem categoria" (o UNIQUE do
    # PostgreSQL ignora linhas com NULL, o que quebraria a unicidade).
    categoria: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    periodo_referencia: Mapped[str] = mapped_column(
        String(20), nullable=False, doc="Ex.: 2026 ou 2026-S1"
    )

    horas_concedidas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_adicionais: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_reservadas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_utilizadas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_estornadas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_expiradas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)

    validade_ate: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    situacao: Mapped[str] = mapped_column(String(20), default="ativo", nullable=False, index=True)

    @property
    def saldo_disponivel(self) -> float:
        """Horas que ainda podem ser reservadas."""
        return round(
            (self.horas_concedidas or 0)
            + (self.horas_adicionais or 0)
            - (self.horas_reservadas or 0)
            - (self.horas_utilizadas or 0)
            - (self.horas_expiradas or 0),
            2,
        )


class MovimentoHoras(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Movimentação do banco de horas (item 25.2) — append-only.

    O saldo NUNCA é alterado sem gravar uma linha aqui, com saldo anterior e
    posterior, dentro da mesma transação.
    """

    __tablename__ = "govinfra_hour_transactions"
    __table_args__ = (
        Index("ix_govinfra_mov_horas_saldo", "saldo_id", "created_at"),
        # Chave de idempotência: reenvio da mesma operação não duplica o débito.
        UniqueConstraint("chave_idempotencia", name="uq_govinfra_mov_horas_idem"),
    )

    saldo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_hour_balances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    quantidade: Mapped[float] = mapped_column(Quantidade, nullable=False)
    saldo_anterior: Mapped[float] = mapped_column(Quantidade, nullable=False)
    saldo_posterior: Mapped[float] = mapped_column(Quantidade, nullable=False)

    solicitacao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_service_requests.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ordem_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_work_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    maquina_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_machines.id", ondelete="SET NULL"), nullable=True
    )
    motivo: Mapped[str | None] = mapped_column(String(300), nullable=True)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    chave_idempotencia: Mapped[str | None] = mapped_column(String(120), nullable=True)

    @staticmethod
    def eh_credito(tipo: str) -> bool:
        return tipo in {
            TipoMovimentoHoras.CONCESSAO.value,
            TipoMovimentoHoras.HORAS_ADICIONAIS.value,
            TipoMovimentoHoras.ESTORNO.value,
            TipoMovimentoHoras.LIBERACAO_RESERVA.value,
        }


class TipoServico(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Catálogo configurável de serviços (item 22)."""

    __tablename__ = "govinfra_service_types"
    __table_args__ = (UniqueConstraint("organizacao_id", "chave", name="uq_govinfra_tipo_servico"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    categorias_compativeis: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    exige_vistoria: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_aprovacao_especial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    documentos_obrigatorios: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    horas_medias: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    consumo_medio_litros: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    usa_banco_horas: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    permite_caminhoes: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    ordem: Mapped[int] = mapped_column(default=0, nullable=False)


class SolicitacaoServico(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    ActorMixin,
    SoftDeleteMixin,
    ConcurrencyMixin,
    GeoMixin,
):
    """Solicitação de serviço rural (item 21)."""

    __tablename__ = "govinfra_service_requests"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "ano", "protocolo", name="uq_govinfra_servico_protocolo"),
        Index("ix_govinfra_servico_situacao", "organizacao_id", "situacao"),
        Index("ix_govinfra_servico_beneficiario", "beneficiario_id", "situacao"),
        Index("ix_govinfra_servico_geo", "latitude", "longitude"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    protocolo: Mapped[int] = mapped_column(Integer, nullable=False)
    protocolo_formatado: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    programa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_programs.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    beneficiario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_program_beneficiaries.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    imovel_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_properties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tipo_servico_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_service_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    dimensoes_estimadas: Mapped[str | None] = mapped_column(String(200), nullable=True)
    quantidade_material: Mapped[str | None] = mapped_column(String(200), nullable=True)
    instrucoes_acesso: Mapped[str | None] = mapped_column(Text, nullable=True)

    horas_estimadas: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    horas_autorizadas: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    maquinas_sugeridas: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    veiculos_sugeridos: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)

    data_desejada: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_agendada: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    prioridade: Mapped[str] = mapped_column(
        String(20), default=Prioridade.NORMAL.value, nullable=False, index=True
    )

    situacao: Mapped[str] = mapped_column(
        String(40), default=SituacaoServico.RASCUNHO.value, nullable=False, index=True
    )
    parecer_tecnico: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivo_reprovacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivo_cancelamento: Mapped[str | None] = mapped_column(Text, nullable=True)
    justificativa_excecao: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    aprovado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    aprovado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HistoricoSituacao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Histórico genérico de transição de estado (item 23).

    Serve para solicitações de caçamba, de serviço e ordens — uma tabela só,
    identificada por `entidade` + `entidade_id`.
    """

    __tablename__ = "govinfra_status_history"
    __table_args__ = (Index("ix_govinfra_hist_entidade", "entidade", "entidade_id", "created_at"),)

    entidade: Mapped[str] = mapped_column(String(60), nullable=False)
    entidade_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    situacao_anterior: Mapped[str | None] = mapped_column(String(40), nullable=True)
    situacao_nova: Mapped[str] = mapped_column(String(40), nullable=False)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Vistoria(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin, GeoMixin):
    """Vistoria técnica no local (item 24) — preenchida no celular."""

    __tablename__ = "govinfra_inspections"

    solicitacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_service_requests.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    tecnico_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    data_agendada: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    realizada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    condicoes_acesso: Mapped[str | None] = mapped_column(Text, nullable=True)
    medidas_aproximadas: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tipo_solo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    riscos: Mapped[str | None] = mapped_column(Text, nullable=True)
    interferencias: Mapped[str | None] = mapped_column(Text, nullable=True)
    materiais_necessarios: Mapped[str | None] = mapped_column(Text, nullable=True)

    maquinas_recomendadas: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    veiculos_recomendados: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    viagens_estimadas: Mapped[int | None] = mapped_column(Integer, nullable=True)
    horas_estimadas: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    combustivel_estimado_litros: Mapped[float | None] = mapped_column(Quantidade, nullable=True)

    parecer: Mapped[str | None] = mapped_column(Text, nullable=True)
    favoravel: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)


class OrdemServico(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin, ConcurrencyMixin, GeoMixin
):
    """Ordem de serviço emitida após aprovação e agendamento (item 32)."""

    __tablename__ = "govinfra_work_orders"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "ano", "numero", name="uq_govinfra_ordem_numero"),
        Index("ix_govinfra_ordem_situacao", "organizacao_id", "situacao"),
        Index("ix_govinfra_ordem_data", "organizacao_id", "data_prevista"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ano: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    numero_formatado: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    solicitacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_service_requests.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    # Token opaco do QR Code — abre a consulta pública da ordem, sem dado pessoal.
    token_consulta: Mapped[str] = mapped_column(String(60), nullable=False, unique=True, index=True)

    data_prevista: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora_prevista_inicio: Mapped[str | None] = mapped_column(String(5), nullable=True)
    hora_prevista_fim: Mapped[str | None] = mapped_column(String(5), nullable=True)

    horas_autorizadas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    viagens_previstas: Mapped[int | None] = mapped_column(Integer, nullable=True)
    combustivel_previsto_litros: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    materiais: Mapped[str | None] = mapped_column(Text, nullable=True)
    orientacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    iniciada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Totais consolidados — SEMPRE recalculados a partir dos apontamentos
    # individuais (item 34), nunca digitados diretamente.
    horas_produtivas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_paradas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_deslocamento: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_totais: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_descontadas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_nao_descontadas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    diesel_consumido_litros: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    viagens_realizadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    servico_realizado: Mapped[str | None] = mapped_column(Text, nullable=True)
    material_movimentado: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocorrencias: Mapped[str | None] = mapped_column(Text, nullable=True)
    avaliacao: Mapped[int | None] = mapped_column(Integer, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    aprovada_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    situacao: Mapped[str] = mapped_column(
        String(30), default=SituacaoOrdem.EMITIDA.value, nullable=False, index=True
    )
    motivo_cancelamento: Mapped[str | None] = mapped_column(Text, nullable=True)

    maquinas: Mapped[list["OrdemMaquina"]] = relationship(
        back_populates="ordem", cascade="all, delete-orphan", lazy="selectin"
    )
    veiculos: Mapped[list["OrdemVeiculo"]] = relationship(
        back_populates="ordem", cascade="all, delete-orphan", lazy="selectin"
    )


class OrdemMaquina(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Máquina + operador alocados na ordem, com apontamento individual (item 34)."""

    __tablename__ = "govinfra_work_order_equipment"
    __table_args__ = (
        UniqueConstraint("ordem_id", "maquina_id", name="uq_govinfra_ordem_maquina"),
        Index("ix_govinfra_ordem_maq_periodo", "maquina_id", "inicio_previsto", "fim_previsto"),
    )

    ordem_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    maquina_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_machines.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    operador_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    principal: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        doc="Máquina principal — base do método de desconto 'equipamento_principal'",
    )

    inicio_previsto: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim_previsto: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    inicio_real: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fim_real: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    horimetro_inicial: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    horimetro_final: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    horas_produtivas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_paradas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_deslocamento: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_descontadas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    consumo_litros: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    ocorrencias: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Autorização administrativa registrada quando o operador não é habilitado.
    excecao_habilitacao: Mapped[str | None] = mapped_column(Text, nullable=True)

    ordem: Mapped["OrdemServico"] = relationship(back_populates="maquinas")


class OrdemVeiculo(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Caminhão + motorista alocados na ordem, com apontamento individual."""

    __tablename__ = "govinfra_work_order_vehicles"
    __table_args__ = (
        UniqueConstraint("ordem_id", "veiculo_id", name="uq_govinfra_ordem_veiculo"),
        Index("ix_govinfra_ordem_vei_periodo", "veiculo_id", "inicio_previsto", "fim_previsto"),
    )

    ordem_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    motorista_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    inicio_previsto: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim_previsto: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    inicio_real: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fim_real: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    km_inicial: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    km_final: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    horas_produtivas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_paradas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_deslocamento: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    horas_descontadas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    consumo_litros: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    viagens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ocorrencias: Mapped[str | None] = mapped_column(Text, nullable=True)
    excecao_habilitacao: Mapped[str | None] = mapped_column(Text, nullable=True)

    ordem: Mapped["OrdemServico"] = relationship(back_populates="veiculos")


class Apontamento(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, GeoMixin):
    """Registro de execução minuto a minuto (item 33).

    Cada início/pausa/retomada/fim vira uma linha. As horas totais da ordem são
    calculadas a partir daqui — o usuário não digita o total.
    """

    __tablename__ = "govinfra_work_logs"
    __table_args__ = (Index("ix_govinfra_apontamento_ordem", "ordem_id", "inicio"),)

    ordem_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordem_maquina_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_work_order_equipment.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    ordem_veiculo_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_work_order_vehicles.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    tipo: Mapped[str] = mapped_column(
        String(30), default=TipoApontamento.PRODUTIVA.value, nullable=False, index=True
    )
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    horas: Mapped[float] = mapped_column(Quantidade, default=0, nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Correção posterior por usuário autorizado (item 33.3).
    corrigido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    justificativa_correcao: Mapped[str | None] = mapped_column(Text, nullable=True)


class Viagem(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, GeoMixin):
    """Viagem de caminhão dentro de uma ordem (item 36)."""

    __tablename__ = "govinfra_trips"
    __table_args__ = (
        UniqueConstraint("ordem_id", "veiculo_id", "numero", name="uq_govinfra_viagem_numero"),
        Index("ix_govinfra_viagem_ordem", "ordem_id", "numero"),
    )

    ordem_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    veiculo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_vehicles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    motorista_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    origem: Mapped[str | None] = mapped_column(String(200), nullable=True)
    destino: Mapped[str | None] = mapped_column(String(200), nullable=True)
    material: Mapped[str | None] = mapped_column(String(200), nullable=True)
    quantidade_estimada_m3: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    peso_kg: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    km_inicial: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    km_final: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    saida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    chegada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def km_percorridos(self) -> float | None:
        if self.km_inicial is None or self.km_final is None:
            return None
        return round(self.km_final - self.km_inicial, 2)


class HorasAdicionais(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Pedido de horas adicionais durante a execução (item 35).

    O sistema nunca aumenta as horas autorizadas sozinho: só a aprovação do
    gestor movimenta o banco de horas.
    """

    __tablename__ = "govinfra_additional_hour_requests"
    __table_args__ = (Index("ix_govinfra_horas_adic_situacao", "ordem_id", "situacao"),)

    ordem_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    solicitante_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    quantidade: Mapped[float] = mapped_column(Quantidade, nullable=False)
    justificativa: Mapped[str] = mapped_column(Text, nullable=False)
    situacao: Mapped[str] = mapped_column(
        String(30), default=SituacaoHorasAdicionais.SOLICITADA.value, nullable=False, index=True
    )
    analisado_por_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True
    )
    analisado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parecer: Mapped[str | None] = mapped_column(Text, nullable=True)
    saldo_disponivel_no_pedido: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
