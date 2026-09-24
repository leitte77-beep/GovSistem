"""O domínio inteiro do GovTask.

    Pedido          o que o Prefeito pediu
    Encaminhamento  cada vai e vem: o Assessor manda a um setor, o setor devolve
    Medicao         a medição de obra (número, período, valor, % executado)
    Anexo           o documento de um encaminhamento, ou a foto de uma medição
    Andamento       a linha do tempo, imutável

Não há mais trilha de fases. O pedido está sempre com o Assessor ou com um
setor; o Assessor é o único que encaminha. O setor executa e devolve.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean,
    event,
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
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class SituacaoPedido(str, Enum):
    """Onde o pedido está agora. O Assessor é sempre o ponto de retorno."""

    COM_ASSESSOR = "COM_ASSESSOR"
    EM_SETOR = "EM_SETOR"
    AGUARDANDO_TERCEIRO = "AGUARDANDO_TERCEIRO"
    CONCLUIDO = "CONCLUIDO"
    CANCELADO = "CANCELADO"


class Prioridade(str, Enum):
    NORMAL = "NORMAL"
    ALTA = "ALTA"
    URGENTE = "URGENTE"


class OrigemPedido(str, Enum):
    """De onde veio o pedido — a pergunta que o Prefeito sempre faz."""

    PREFEITO = "PREFEITO"
    DEPUTADO = "DEPUTADO"
    SECRETARIA = "SECRETARIA"
    VEREADOR = "VEREADOR"
    CIDADAO = "CIDADAO"
    OUTRO = "OUTRO"


class StatusEncaminhamento(str, Enum):
    """O ciclo de vida de um vai e vem."""

    # Na mesa do setor, sem dono: qualquer pessoa do setor pode assumir.
    AGUARDANDO = "AGUARDANDO"
    # Alguém assumiu. Some da fila dos demais, salvo para os mencionados.
    EM_EXECUCAO = "EM_EXECUCAO"
    # O setor pediu mais informação ao Assessor e aguarda a resposta.
    AGUARDANDO_COMPLEMENTO = "AGUARDANDO_COMPLEMENTO"
    # Executado e devolvido ao Assessor.
    CONCLUIDO = "CONCLUIDO"
    CANCELADO = "CANCELADO"


class TipoDocumento(str, Enum):
    OFICIO = "OFICIO"
    CERTIDAO = "CERTIDAO"
    PARECER = "PARECER"
    PROJETO = "PROJETO"
    NOTA_FISCAL = "NOTA_FISCAL"
    CONTRATO = "CONTRATO"
    FOTO = "FOTO"
    OUTRO = "OUTRO"


class CategoriaAnexo(str, Enum):
    DOCUMENTO = "DOCUMENTO"
    FOTO = "FOTO"


class TipoAndamento(str, Enum):
    ABERTURA = "ABERTURA"
    ENCAMINHAMENTO = "ENCAMINHAMENTO"
    ASSUNCAO = "ASSUNCAO"
    TRANSFERENCIA = "TRANSFERENCIA"
    MENCAO = "MENCAO"
    PRAZO = "PRAZO"
    COMPLEMENTO_SOLICITADO = "COMPLEMENTO_SOLICITADO"
    COMPLEMENTO_RESPONDIDO = "COMPLEMENTO_RESPONDIDO"
    ANEXO = "ANEXO"
    MEDICAO = "MEDICAO"
    DEVOLUCAO = "DEVOLUCAO"
    COMENTARIO = "COMENTARIO"
    CONCLUSAO = "CONCLUSAO"
    CANCELAMENTO = "CANCELAMENTO"
    TERCEIRO = "TERCEIRO"
    EDICAO = "EDICAO"
    PARADA = "PARADA"


class MotivoParada(str, Enum):
    """Por que o pedido não anda — a pergunta que o Prefeito faz."""

    DOCUMENTO = "DOCUMENTO"
    GOVERNO = "GOVERNO"
    LICITACAO = "LICITACAO"
    RECURSO = "RECURSO"
    ASSINATURA = "ASSINATURA"
    OUTRO = "OUTRO"


ROTULO_MOTIVO_PARADA: dict[str, str] = {
    "DOCUMENTO": "Aguardando documento",
    "GOVERNO": "Aguardando o governo",
    "LICITACAO": "Em licitação",
    "RECURSO": "Falta de recurso",
    "ASSINATURA": "Aguardando assinatura",
    "OUTRO": "Outro motivo",
}


class Pedido(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "pedidos"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "exercicio", "sequencial",
            name="uq_pedido_org_exercicio_sequencial",
        ),
        UniqueConstraint("organization_id", "numero", name="uq_pedido_org_numero"),
        Index("ix_pedidos_org_situacao", "organization_id", "situacao"),
        Index("ix_pedidos_org_responsavel", "organization_id", "responsavel_atual_id"),
        Index("ix_pedidos_org_setor", "organization_id", "setor_atual"),
        Index("ix_pedidos_org_prazo", "organization_id", "prazo_atual"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Numeração por exercício, como o setor de protocolo espera: 2026/000001.
    numero: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    exercicio: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    sequencial: Mapped[int] = mapped_column(Integer, nullable=False)

    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # AQUISICAO, OBRA ou OUTRO (app.core.fluxo).
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    origem: Mapped[str] = mapped_column(
        String(20), nullable=False, default=OrigemPedido.PREFEITO.value
    )
    origem_nome: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)

    valor_previsto: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    valor_liberado: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    valor_pago: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    prioridade: Mapped[str] = mapped_column(
        String(10), nullable=False, default=Prioridade.NORMAL.value
    )

    situacao: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=SituacaoPedido.COM_ASSESSOR.value,
        index=True,
    )
    # Onde o pedido está agora: setor e responsável da fase em execução.
    setor_atual: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    responsavel_atual_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    prazo_atual: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)

    # O setor pediu informação ao Assessor e o pedido voltou para a mesa dele.
    complemento_pendente: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=False
    )

    # Protocolo no sistema do governo.
    protocolo_externo: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    protocolo_sistema: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    protocolo_orgao: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    protocolo_data: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)

    # Emenda parlamentar que financia o pedido (quando vem de deputado).
    emenda: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    partido: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Onde a obra/entrega acontece.
    endereco: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6), nullable=True)
    # Etapa do financeiro entre previsto e liberado.
    valor_empenhado: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    # O que o governo respondeu por último sobre o protocolo.
    protocolo_situacao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Desde quando o pedido está onde está (mesma situação e mesmo setor).
    # Mantido por listener em `situacao`/`setor_atual`, logo abaixo.
    situacao_desde: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Por que está parado. Limpo sempre que o pedido muda de mão.
    motivo_parada: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    motivo_parada_texto: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    motivo_parada_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Espelho do último evento da timeline.
    ultima_movimentacao_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    criado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    concluido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    motivo_cancelamento: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    encaminhamentos: Mapped[list["Encaminhamento"]] = relationship(
        back_populates="pedido",
        cascade="all, delete-orphan",
        order_by="Encaminhamento.ordem",
    )
    medicoes: Mapped[list["Medicao"]] = relationship(
        back_populates="pedido",
        cascade="all, delete-orphan",
        order_by="Medicao.created_at",
    )
    anexos: Mapped[list["Anexo"]] = relationship(
        back_populates="pedido", cascade="all, delete-orphan"
    )
    andamentos: Mapped[list["Andamento"]] = relationship(
        back_populates="pedido",
        cascade="all, delete-orphan",
        order_by="Andamento.created_at",
    )
    responsavel_atual = relationship("User", foreign_keys=[responsavel_atual_id])
    criado_por = relationship("User", foreign_keys=[criado_por_id])


class Encaminhamento(Base, TimestampMixin):
    """Um vai e vem: o Assessor manda ao setor; o setor assume e devolve.

    Não há sequência fixa. Cada encaminhamento é uma passagem por um setor,
    com prazo, responsável e resultado próprios. Reenviar depois de devolver
    cria um novo encaminhamento (ordem+1) — o histórico do vai e vem.
    """

    __tablename__ = "encaminhamentos"
    __table_args__ = (
        UniqueConstraint("pedido_id", "ordem", name="uq_encaminhamento_ordem"),
        Index("ix_encaminhamentos_responsavel", "responsavel_id", "status"),
        Index("ix_encaminhamentos_setor_status", "setor", "status"),
    )

    pedido_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    # Setor de destino. É validado contra os setores ativos da prefeitura.
    setor: Mapped[str] = mapped_column(String(30), nullable=False)
    # O que o Assessor pede, em uma frase, e o detalhamento da solicitação.
    assunto: Mapped[str] = mapped_column(String(160), nullable=False)
    instrucoes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=StatusEncaminhamento.AGUARDANDO.value
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Engenheiros mencionados pelo responsável: veem, comentam, anexam e
    # concluem junto. Lista de ids de usuário.
    participantes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    prazo: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    # True quando o prazo foi sugerido pelo sistema; False quando o Assessor
    # ou o responsável informou explicitamente.
    prazo_sugerido: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=True
    )

    assumido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    devolvido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Texto do complemento solicitado ao Assessor e o que veio na resposta.
    complemento_pedido: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    complemento_resposta: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # Parecer/o que o setor entrega ao devolver.
    resultado: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # Resposta em construção: o setor escreve aos poucos e devolve no fim.
    rascunho: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    rascunho_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Entregáveis pedidos: [{"item": "CND federal", "feito": false}].
    checklist: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    criado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Quantas vezes foi transferido dentro do setor. Alto = tarefa repassada.
    transferencias: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    pedido: Mapped["Pedido"] = relationship(back_populates="encaminhamentos")
    responsavel = relationship("User", foreign_keys=[responsavel_id])
    criado_por = relationship("User", foreign_keys=[criado_por_id])
    anexos: Mapped[list["Anexo"]] = relationship(back_populates="encaminhamento")
    medicoes: Mapped[list["Medicao"]] = relationship(back_populates="encaminhamento")


class Medicao(Base, TimestampMixin):
    """Medição de obra: o avanço físico-financeiro, com fotos anexadas."""

    __tablename__ = "medicoes"
    __table_args__ = (
        UniqueConstraint("pedido_id", "numero", name="uq_medicao_pedido_numero"),
        Index("ix_medicoes_pedido", "pedido_id", "created_at"),
    )

    pedido_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    encaminhamento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("encaminhamentos.id", ondelete="SET NULL"),
        nullable=True,
    )
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    periodo_inicio: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    periodo_fim: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    valor: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    percentual_executado: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    observacao: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    pedido: Mapped["Pedido"] = relationship(back_populates="medicoes")
    encaminhamento: Mapped[Optional["Encaminhamento"]] = relationship(
        back_populates="medicoes"
    )
    responsavel = relationship("User", foreign_keys=[responsavel_id])
    fotos: Mapped[list["Anexo"]] = relationship(back_populates="medicao")


class Anexo(Base, TimestampMixin, SoftDeleteMixin):
    """Documento preso a um encaminhamento, ou foto de uma medição."""

    __tablename__ = "anexos"
    __table_args__ = (
        Index("ix_anexos_pedido_encaminhamento", "pedido_id", "encaminhamento_id"),
    )

    pedido_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    encaminhamento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("encaminhamentos.id", ondelete="SET NULL"),
        nullable=True,
    )
    medicao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medicoes.id", ondelete="SET NULL"),
        nullable=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )

    nome_original: Mapped[str] = mapped_column(String(255), nullable=False)
    # Caminho relativo ao UPLOAD_DIR. Nunca absoluto, nunca vindo do cliente.
    caminho: Mapped[str] = mapped_column(String(500), nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    categoria: Mapped[str] = mapped_column(
        String(12), nullable=False, default=CategoriaAnexo.DOCUMENTO.value
    )
    # Ofício, certidão, parecer… (TipoDocumento). Livre para o município.
    tipo_documento: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    legenda: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    enviado_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    pedido: Mapped["Pedido"] = relationship(back_populates="anexos")
    encaminhamento: Mapped[Optional["Encaminhamento"]] = relationship(
        back_populates="anexos"
    )
    medicao: Mapped[Optional["Medicao"]] = relationship(back_populates="fotos")
    enviado_por = relationship("User", foreign_keys=[enviado_por_id])


class Andamento(Base, TimestampMixin):
    """Linha do tempo. Só cresce: nada aqui é editado ou apagado.

    `autor_nome` é gravado junto do id porque o histórico precisa continuar
    legível depois que o servidor sair da prefeitura.
    """

    __tablename__ = "andamentos"
    __table_args__ = (Index("ix_andamentos_pedido_data", "pedido_id", "created_at"),)

    pedido_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    encaminhamento_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("encaminhamentos.id", ondelete="SET NULL"),
        nullable=True,
    )
    tipo: Mapped[str] = mapped_column(String(24), nullable=False)
    texto: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    autor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    autor_nome: Mapped[str] = mapped_column(String(180), nullable=False, default="")
    interno: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    # Detalhe estruturado: mudanças {"campo": [antes, depois]}, anexo_id,
    # mencionados, aguardando_resposta.
    dados: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    pedido: Mapped["Pedido"] = relationship(back_populates="andamentos")


def _mudou_de_mao(pedido: Pedido, valor, anterior, _initiator):
    """Situação ou setor mudou: zera o relógio e o motivo da parada."""
    if valor == anterior:
        return valor
    from datetime import timezone as _tz

    pedido.situacao_desde = datetime.now(_tz.utc)
    pedido.motivo_parada = None
    pedido.motivo_parada_texto = None
    pedido.motivo_parada_em = None
    return valor


event.listen(Pedido.situacao, "set", _mudou_de_mao, retval=True)
event.listen(Pedido.setor_atual, "set", _mudou_de_mao, retval=True)
