"""Modelos de instrumentos técnico-operativos (questionários dinâmicos)."""
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Boolean, Date, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Questionario(Base, TimestampMixin):
    """Questionario / instrumento técnico-operativo configurável."""

    __tablename__ = "questionarios"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    service_type_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    ativo: Mapped[bool] = mapped_column(default=True)

    questoes = relationship("Questao", backref="questionario", order_by="Questao.ordem",
                            cascade="all, delete-orphan")


class Questao(Base, TimestampMixin):
    """Questao de um questionario."""

    __tablename__ = "questoes"

    questionario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enunciado: Mapped[str] = mapped_column(String(500), nullable=False)
    tipo: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="TEXTO | NUMERO | DATA | SELECAO_UNICA | SELECAO_MULTIPLA | MARCACAO | ANEXO"
    )
    obrigatorio: Mapped[bool] = mapped_column(default=False)
    opcoes: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="Opcoes para SELECAO_UNICA e SELECAO_MULTIPLA"
    )


class RespostaQuestionario(Base, TimestampMixin):
    """Preenchimento de um questionario para uma familia/pessoa."""

    __tablename__ = "respostas_questionario"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    questionario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questionarios.id", ondelete="CASCADE"),
        nullable=False,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=True,
    )
    attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendances.id", ondelete="SET NULL"),
        nullable=True,
    )
    data_preenchimento: Mapped[date] = mapped_column(Date, nullable=False)
    profissional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )

    questionario = relationship("Questionario")
    respostas = relationship("RespostaQuestao", backref="resposta", cascade="all, delete-orphan")


class RespostaQuestao(Base, TimestampMixin):
    """Valor de uma questao respondida."""

    __tablename__ = "respostas_questao"

    resposta_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("respostas_questionario.id", ondelete="CASCADE"),
        nullable=False,
    )
    questao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questoes.id", ondelete="CASCADE"),
        nullable=False,
    )
    valor: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    questao = relationship("Questao")
