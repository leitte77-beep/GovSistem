"""Fiscalização contratual (seções 60-63): ocorrências, medições, notas fiscais."""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import ActorMixin, Base, Dinheiro, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ClassificacaoOcorrencia, StatusMedicao, StatusNotaFiscal, StatusOcorrencia


class OcorrenciaContrato(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_ocorrencias"

    contrato_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_contratos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    classificacao: Mapped[str] = mapped_column(
        String(20), default=ClassificacaoOcorrencia.INFORMATIVA.value, nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default=StatusOcorrencia.ABERTA.value, nullable=False)


class Medicao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_medicoes"

    contrato_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_contratos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero: Mapped[str] = mapped_column(String(40), nullable=False)
    competencia: Mapped[str] = mapped_column(String(7), nullable=False, doc="AAAA-MM")
    periodo_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    periodo_fim: Mapped[date | None] = mapped_column(Date, nullable=True)
    valor: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    percentual: Mapped[float | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(30), default=StatusMedicao.AGUARDANDO_ANALISE.value, nullable=False)


class NotaFiscal(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    __tablename__ = "govcompras_notas_fiscais"

    contrato_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_contratos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    medicao_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_medicoes.id"), nullable=True)
    numero: Mapped[str] = mapped_column(String(40), nullable=False)
    serie: Mapped[str | None] = mapped_column(String(10), nullable=True)
    data: Mapped[date] = mapped_column(Date, nullable=False)
    valor: Mapped[float] = mapped_column(Dinheiro, nullable=False)
    competencia: Mapped[str | None] = mapped_column(String(7), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=StatusNotaFiscal.RECEBIDA.value, nullable=False)
