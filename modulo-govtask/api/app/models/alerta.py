"""Central de alertas e configuração de prazos (§37–§40).

Alerta ≠ notificação. A **notificação** é a mensagem entregue a uma pessoa; o
**alerta** é o sinal de que algo na demanda precisa de atenção, existe uma vez
só por situação e vale para quem estiver olhando o painel. Separar os dois
evita o problema clássico de "cinco pessoas receberam e ninguém resolveu": o
alerta continua aberto até alguém tratá-lo.

Cada alerta carrega uma `chave` determinística. Reprocessar a varredura não
duplica nada — é o que permite rodar o motor de hora em hora sem fila.
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import SeveridadeAlerta, TipoAlerta

if TYPE_CHECKING:
    from app.models.demanda import Demanda
    from app.models.tarefa import Tarefa
    from app.models.user import User


class Alerta(Base, TimestampMixin):
    __tablename__ = "alertas"
    __table_args__ = (
        UniqueConstraint("organization_id", "chave", name="uq_alerta_org_chave"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chave: Mapped[str] = mapped_column(
        String(200), nullable=False, index=True,
        comment="Identidade da situação (ex.: 'tarefa:<id>:vencido:3'); "
                "torna a varredura idempotente",
    )
    tipo: Mapped[TipoAlerta] = mapped_column(String(40), nullable=False, index=True)
    severidade: Mapped[SeveridadeAlerta] = mapped_column(
        String(20), nullable=False, default=SeveridadeAlerta.AVISO, index=True
    )
    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    detalhe: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    demanda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    tarefa_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tarefas.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    responsavel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
        comment="A quem o alerta se dirige; nulo = alerta da organização",
    )
    setor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("setores.id", ondelete="SET NULL"), nullable=True
    )

    lido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Quando o destinatário viu o alerta; alimenta o contador do sino",
    )
    resolvido_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True,
        comment="Fechado pelo motor quando a situação deixa de existir, "
                "ou dispensado por alguém",
    )
    resolvido_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    motivo_resolucao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadados: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    demanda: Mapped[Optional["Demanda"]] = relationship("Demanda", lazy="selectin")
    tarefa: Mapped[Optional["Tarefa"]] = relationship("Tarefa")
    responsavel: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[responsavel_id], lazy="selectin"
    )

    @property
    def aberto(self) -> bool:
        return self.resolvido_em is None

    def __repr__(self) -> str:
        return f"<Alerta {self.tipo} {self.chave}>"


class AlertaConfig(Base, TimestampMixin):
    """Como cada organização quer ser avisada (§37, §38, §39).

    Substitui a configuração antiga de escalonamento, que só conhecia três
    níveis fixos e só enxergava tarefas de convênio.
    """

    __tablename__ = "alerta_config"

    # `TimestampMixin` já traz um `id`; marcar a organização como chave
    # primária formaria uma PK composta, que deixaria passar duas configurações
    # para o mesmo município. A unicidade é que garante "uma config por tenant",
    # e é dela que o serviço depende ao usar `scalar_one_or_none`.
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    marcos_prazo: Mapped[list] = mapped_column(
        JSON, nullable=False,
        default=lambda: [30, 15, 10, 7, 5, 3, 1, 0],
        comment="Dias antes do vencimento em que o aviso é disparado (§37)",
    )
    escalonamento: Mapped[list] = mapped_column(
        JSON, nullable=False,
        default=lambda: [
            {"dias": 1, "alvo": "RESPONSAVEL"},
            {"dias": 3, "alvo": "CHEFE_SETOR"},
            {"dias": 5, "alvo": "RESPONSAVEL_GERAL"},
            {"dias": 10, "alvo": "GABINETE"},
        ],
        comment="Escada de cobrança por dias de atraso (§38)",
    )
    inatividade_dias: Mapped[list] = mapped_column(
        JSON, nullable=False,
        default=lambda: [3, 7, 15, 30],
        comment="Marcos de demanda sem movimentação (§39)",
    )
    dias_sem_aceite: Mapped[int] = mapped_column(
        Integer, default=2, nullable=False,
        comment="Dias que uma tarefa pode ficar sem ser recebida antes do alerta",
    )
    ponto_facultativo_e_util: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Contar ponto facultativo como dia útil na contagem de prazos",
    )
    ultima_varredura_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ultima_varredura_data: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    @staticmethod
    def padrao(organization_id: uuid.UUID) -> "AlertaConfig":
        return AlertaConfig(
            organization_id=organization_id,
            marcos_prazo=[30, 15, 10, 7, 5, 3, 1, 0],
            escalonamento=[
                {"dias": 1, "alvo": "RESPONSAVEL"},
                {"dias": 3, "alvo": "CHEFE_SETOR"},
                {"dias": 5, "alvo": "RESPONSAVEL_GERAL"},
                {"dias": 10, "alvo": "GABINETE"},
            ],
            inatividade_dias=[3, 7, 15, 30],
        )
