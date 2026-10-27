"""Laboratório e SISCAN (Fase 10, B.8-001…030, B.8-032…034, B.5-001…014, B.5-016…018).

O catálogo de exames é **configuração versionada** do tenant (campos de
resultado, referências, valores críticos, layout de laudo, regras de
autorização/carência/validade). O SISCAN usa modelos de formulário
versionados (``modelos_siscan``): nenhum layout oficial está no código.
Cada transição de etapa e cada problema viram ``ocorrencias_exame``
(histórico imutável do exame).
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
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    BaixaMixin,
    Base,
    JSONType,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    VersaoMixin,
)


class ExameLaboratorio(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin, BaixaMixin
):
    """B.8-001/003/004/005/008/021/025 — exame configurável, versionado por código.

    ``campos``: [{"codigo", "nome", "tipo": NUMERICO|TEXTO|OPCAO, "unidade",
    "referencia_min", "referencia_max", "critico_min", "critico_max",
    "limite_min", "limite_max", "opcoes", "obrigatorio"}]. ``estabelecimento_id``
    nulo vale para a rede; a cópia para outra unidade cria nova versão (B.8-003).
    """

    __tablename__ = "exames_laboratorio"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "codigo",
            "estabelecimento_id",
            "numero_versao",
            name="uq_exames_lab_versao",
        ),
        CheckConstraint("tipo IN ('LABORATORIO','RADIOLOGIA')", name="ck_exames_lab_tipo"),
    )
    codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    nome: Mapped[str] = mapped_column(String(240), nullable=False)
    tipo: Mapped[str] = mapped_column(String(12), default="LABORATORIO", nullable=False)
    estabelecimento_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=True
    )
    numero_versao: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    copiado_de_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    metodo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    material: Mapped[str | None] = mapped_column(String(80), nullable=True)
    bancada: Mapped[str | None] = mapped_column(String(80), nullable=True)
    campos: Mapped[list] = mapped_column(JSONType, nullable=False)
    layout_laudo: Mapped[str | None] = mapped_column(Text, nullable=True)
    procedimento_sigtap: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cids: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    regras_faturamento: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    valor_unitario: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    exige_autorizacao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    alto_custo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    carencia_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    validade_autorizacao_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    validade_resultado_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prazo_entrega_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sigiloso: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    estabelecimentos_requisitantes: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    cbos_liberacao: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    integrado_equipamento: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    equipamento_codigo: Mapped[str | None] = mapped_column(String(60), nullable=True)


class RequisicaoExame(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin
):
    """B.8-010/011/014/024/034 — requisição recebida no laboratório."""

    __tablename__ = "requisicoes_exame"
    __table_args__ = (
        UniqueConstraint("tenant_id", "protocolo", name="uq_requisicoes_protocolo"),
        UniqueConstraint("tenant_id", "id_cliente", name="uq_requisicoes_id_cliente"),
        Index("ix_requisicoes_cidadao", "tenant_id", "cidadao_id", "created_at"),
    )
    protocolo: Mapped[str] = mapped_column(String(20), nullable=False)
    id_cliente: Mapped[str | None] = mapped_column(String(80), nullable=True)
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    estabelecimento_origem_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=False
    )
    estabelecimento_coleta_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estabelecimentos.id", ondelete="RESTRICT"), nullable=False
    )
    origem: Mapped[str] = mapped_column(String(20), default="AVULSA", nullable=False)
    atendimento_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    agendamento_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    profissional_solicitante_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("profissionais.id", ondelete="SET NULL"), nullable=True
    )
    solicitante_externo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    urgente: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gestante: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    contingencia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recebida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    previsao_retirada: Mapped[date | None] = mapped_column(Date, nullable=True)
    codigo_acesso_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    portal_tentativas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    portal_bloqueado_ate: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ItemExame(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    """B.8-005/012/013/016/017/018/020/022/023/025/007 — um exame da requisição."""

    __tablename__ = "itens_exame"
    __table_args__ = (
        UniqueConstraint("tenant_id", "etiqueta", name="uq_itens_exame_etiqueta"),
        Index("ix_itens_exame_situacao", "tenant_id", "situacao"),
        Index("ix_itens_exame_cidadao", "tenant_id", "cidadao_id", "exame_codigo"),
    )
    requisicao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("requisicoes_exame.id", ondelete="RESTRICT"), nullable=False
    )
    cidadao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cidadaos.id", ondelete="RESTRICT"), nullable=False
    )
    exame_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("exames_laboratorio.id", ondelete="RESTRICT"), nullable=False
    )
    exame_codigo: Mapped[str] = mapped_column(String(30), nullable=False)
    etiqueta: Mapped[str] = mapped_column(String(30), nullable=False)
    etiqueta_impressoes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    situacao: Mapped[str] = mapped_column(String(24), default="REQUISITADO", nullable=False)
    sigiloso: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    autorizacao_situacao: Mapped[str | None] = mapped_column(String(12), nullable=True)
    autorizado_por_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    autorizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    autorizacao_valida_ate: Mapped[date | None] = mapped_column(Date, nullable=True)
    alertas: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    material: Mapped[str | None] = mapped_column(String(80), nullable=True)
    coletado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    coletador_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    valores: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    texto_livre: Mapped[str | None] = mapped_column(Text, nullable=True)
    anexos: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    avaliacao: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    incompleto: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fora_referencia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    critico: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resultado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resultado_por_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    resultado_versao: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    liberado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    liberado_por_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    assinatura_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assinatura_tipo: Mapped[str | None] = mapped_column(String(12), nullable=True)
    entregue_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    entregue_a: Mapped[str | None] = mapped_column(String(200), nullable=True)
    entregue_documento: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entregue_parentesco: Mapped[str | None] = mapped_column(String(60), nullable=True)
    id_cliente_resultado: Mapped[str | None] = mapped_column(String(80), nullable=True)


class OcorrenciaExame(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    """B.8-002/016/029 — etapa ou problema (coleta, amostra, transporte, processamento)."""

    __tablename__ = "ocorrencias_exame"
    __table_args__ = (Index("ix_ocorrencias_item", "tenant_id", "item_id", "ocorrido_em"),)
    requisicao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("requisicoes_exame.id", ondelete="RESTRICT"), nullable=False
    )
    item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("itens_exame.id", ondelete="RESTRICT"), nullable=True
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    etapa: Mapped[str | None] = mapped_column(String(24), nullable=True)
    categoria: Mapped[str | None] = mapped_column(String(20), nullable=True)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    dados: Mapped[dict | None] = mapped_column(JSONType, nullable=True)


class MensagemEquipamento(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, ActorMixin):
    """B.8-009 — log de interfaceamento; falhas ficam para reprocessamento."""

    __tablename__ = "mensagens_equipamento"
    __table_args__ = (
        UniqueConstraint("tenant_id", "equipamento", "id_mensagem", name="uq_msg_equipamento"),
    )
    equipamento: Mapped[str] = mapped_column(String(60), nullable=False)
    id_mensagem: Mapped[str] = mapped_column(String(80), nullable=False)
    etiqueta: Mapped[str | None] = mapped_column(String(30), nullable=True)
    situacao: Mapped[str] = mapped_column(String(12), nullable=False)
    erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONType, nullable=True)


class ModeloSiscan(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    """B.5-005/018 — formulário de requisição/resultado por tipo, versionado.

    ``campos_requisicao``/``campos_resultado``: [{"codigo", "nome", "tipo",
    "opcoes", "obrigatorio"}]; ``valores_alterados``: {campo: [valores]} que
    marcam resultado alterado para busca ativa (B.5-013).
    """

    __tablename__ = "modelos_siscan"
    __table_args__ = (
        UniqueConstraint("tenant_id", "tipo", "numero_versao", name="uq_modelos_siscan_versao"),
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    numero_versao: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fonte_normativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    campos_requisicao: Mapped[list] = mapped_column(JSONType, nullable=False)
    campos_resultado: Mapped[list] = mapped_column(JSONType, nullable=False)
    valores_alterados: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    procedimento_coleta_sigtap: Mapped[str | None] = mapped_column(String(10), nullable=True)
    prazo_resultado_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    intervalo_rastreamento_meses: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ExameSiscan(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantMixin, VersaoMixin, ActorMixin):
    """B.5-001…013/016 — requisição e resultado de colo do útero e mama."""

    __tablename__ = "exames_siscan"
    __table_args__ = (
        Index("ix_exames_siscan_cidadao", "tenant_id", "cidadao_id", "tipo"),
        Index("ix_exames_siscan_situacao", "tenant_id", "situacao"),
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    modelo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("modelos_siscan.id", ondelete="RESTRICT"), nullable=False
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
    especialidade: Mapped[str | None] = mapped_column(String(120), nullable=True)
    material: Mapped[str | None] = mapped_column(String(80), nullable=True)
    coletado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    informacoes_clinicas: Mapped[str | None] = mapped_column(Text, nullable=True)
    dados_requisicao: Mapped[dict] = mapped_column(JSONType, nullable=False)
    situacao: Mapped[str] = mapped_column(String(16), default="REQUISITADO", nullable=False)
    enviado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    prestador: Mapped[str | None] = mapped_column(String(200), nullable=True)
    dados_resultado: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    resultado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resultado_alterado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assinado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assinado_por_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    assinatura_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    comunicado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    comunicado_meio: Mapped[str | None] = mapped_column(String(40), nullable=True)
    seguimento: Mapped[str | None] = mapped_column(Text, nullable=True)
    proximo_exame_em: Mapped[date | None] = mapped_column(Date, nullable=True)
