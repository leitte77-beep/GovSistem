"""Planejamento da contratação (seções 20-23): DFD, ETP, TR e Matriz de Risco.

Todos 1:1 com `ProcessoInstancia`, pois nascem dentro do ciclo de vida do
processo (não têm existência própria fora dele).
"""

import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import ActorMixin, Base, Dinheiro, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import StatusDocumentoPlanejamento, StatusTopico


class Dfd(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Documento de Formalização da Demanda (seção 20)."""

    __tablename__ = "govcompras_dfds"
    __table_args__ = (UniqueConstraint("processo_id", name="uq_govcompras_dfd_processo"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    descricao_necessidade: Mapped[str] = mapped_column(Text, nullable=False)
    quantidade_estimada: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default=StatusDocumentoPlanejamento.RASCUNHO.value, nullable=False
    )
    aprovado_por_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=True)
    aprovado_em: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Etp(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Estudo Técnico Preliminar (seção 21) — elaborado por tópicos."""

    __tablename__ = "govcompras_etps"
    __table_args__ = (UniqueConstraint("processo_id", name="uq_govcompras_etp_processo"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default=StatusDocumentoPlanejamento.RASCUNHO.value, nullable=False
    )

    topicos: Mapped[list["EtpTopico"]] = relationship(
        back_populates="etp", cascade="all, delete-orphan", lazy="selectin"
    )


class EtpTopico(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_etp_topicos"
    __table_args__ = (UniqueConstraint("etp_id", "ordem", name="uq_govcompras_etp_topico_ordem"),)

    etp_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_etps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordem: Mapped[int] = mapped_column(nullable=False)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    conteudo: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=StatusTopico.PENDENTE.value, nullable=False)
    sugerido_por_ia: Mapped[bool] = mapped_column(default=False, nullable=False)

    etp: Mapped["Etp"] = relationship(back_populates="topicos")

    @staticmethod
    def topicos_padrao() -> list[str]:
        """Roteiro-base do ETP — apenas sugestão inicial, todo editável."""
        return [
            "Necessidade da contratação",
            "Descrição da solução como um todo",
            "Requisitos da contratação",
            "Levantamento e estimativa das quantidades",
            "Estimativa do valor da contratação",
            "Justificativa para o parcelamento ou não da solução",
            "Resultados pretendidos",
            "Providências a serem adotadas",
            "Declaração de viabilidade",
        ]


class TermoReferencia(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Termo de Referência (seção 23)."""

    __tablename__ = "govcompras_termos_referencia"
    __table_args__ = (UniqueConstraint("processo_id", name="uq_govcompras_tr_processo"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    versao: Mapped[int] = mapped_column(default=1, nullable=False)
    objeto: Mapped[str | None] = mapped_column(Text, nullable=True)
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    especificacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    local_entrega: Mapped[str | None] = mapped_column(String(300), nullable=True)
    prazo_execucao: Mapped[str | None] = mapped_column(String(200), nullable=True)
    obrigacoes_contratada: Mapped[str | None] = mapped_column(Text, nullable=True)
    obrigacoes_administracao: Mapped[str | None] = mapped_column(Text, nullable=True)
    criterio_julgamento: Mapped[str | None] = mapped_column(String(60), nullable=True)
    criterios_aceitacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    sancoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    valor_estimado: Mapped[float | None] = mapped_column(Dinheiro, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default=StatusDocumentoPlanejamento.RASCUNHO.value, nullable=False
    )
    aprovado_por_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("govcompras_users.id"), nullable=True)


class MatrizRisco(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Matriz de riscos (seção 22)."""

    __tablename__ = "govcompras_matrizes_risco"
    __table_args__ = (UniqueConstraint("processo_id", name="uq_govcompras_matriz_processo"),)

    processo_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_processos.id", ondelete="CASCADE"), nullable=False, index=True
    )

    itens: Mapped[list["MatrizRiscoItem"]] = relationship(
        back_populates="matriz", cascade="all, delete-orphan", lazy="selectin"
    )


class MatrizRiscoItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "govcompras_matriz_risco_itens"

    matriz_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govcompras_matrizes_risco.id", ondelete="CASCADE"), nullable=False, index=True
    )
    categoria: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descricao_risco: Mapped[str] = mapped_column(Text, nullable=False)
    probabilidade: Mapped[str] = mapped_column(String(20), nullable=False, doc="baixa | media | alta")
    impacto: Mapped[str] = mapped_column(String(20), nullable=False, doc="baixo | medio | alto")
    responsavel_mitigacao: Mapped[str | None] = mapped_column(String(200), nullable=True)
    acao_preventiva: Mapped[str | None] = mapped_column(Text, nullable=True)
    acao_contingencia: Mapped[str | None] = mapped_column(Text, nullable=True)

    matriz: Mapped["MatrizRisco"] = relationship(back_populates="itens")

    @property
    def nivel(self) -> str:
        pontos = {"baixa": 1, "media": 2, "alta": 3, "baixo": 1, "medio": 2, "alto": 3}
        score = pontos.get(self.probabilidade, 1) * pontos.get(self.impacto, 1)
        if score >= 6:
            return "alto"
        if score >= 3:
            return "medio"
        return "baixo"
