import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class RendaMembro(Base, TimestampMixin):
    """Renda de cada membro do grupo familiar."""

    __tablename__ = "rendas_membro"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        nullable=False,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="Formal | Informal | Autonomo | Aposentadoria | BPC | PBF | Pensao | Doacao | Outro"
    )
    valor: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    data_inicio: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    data_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    comprovante_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    person = relationship("Person", backref="rendas")
    family = relationship("Family", backref="rendas")


class DespesaFamiliar(Base, TimestampMixin):
    """Despesas mensais do grupo familiar."""

    __tablename__ = "despesas_familiares"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="Aluguel | Agua | Luz | Gas | Alimentacao | Transporte | Saude | Educacao | Farmacia | Vestuario | Divida | Outro"
    )
    valor: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    data_referencia: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    family = relationship("Family", backref="despesas")


class DadosRua(Base, TimestampMixin):
    """Dados de situacao de rua conforme formulario suplementar CadUnico."""

    __tablename__ = "dados_rua"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    pessoa_referencia_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="SET NULL"),
        nullable=True,
    )
    tempo_em_situacao_rua: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Ate_6_meses | 6_meses_a_1_ano | 1_a_2_anos | 2_a_5_anos | 5_a_10_anos | Mais_de_10_anos"
    )
    motivo: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Desemprego | Alcoolismo | Drogas | Rompimento_familiar | Tratamento_saude | Ameaca_morte | Despejo | Outro"
    )
    local_pernoite: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Rua | Albergue | Abrigo | Domicilio_coletivo | Outro"
    )
    possui_acompanhamento_institucional: Mapped[Optional[bool]] = mapped_column(nullable=True)
    instituicao_acompanhamento: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tempo_permanencia_municipio: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
    )
    origem_municipio: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    origem_uf: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    referencias_familiares: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    family = relationship("Family", backref="dados_rua")
    pessoa_referencia = relationship("Person")


class CondicoesSaude(Base, TimestampMixin):
    """Condicoes de saude da familia conforme Prontuario SUAS."""

    __tablename__ = "condicoes_saude"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    data_coleta: Mapped[date] = mapped_column(Date, nullable=False)
    profissional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    presenca_gestantes: Mapped[bool] = mapped_column(default=False)
    quantidade_gestantes: Mapped[Optional[int]] = mapped_column(default=0)
    presenca_nutrizes: Mapped[bool] = mapped_column(default=False)
    quantidade_nutrizes: Mapped[Optional[int]] = mapped_column(default=0)
    pessoas_deficiencia_cuidado_terceiros: Mapped[Optional[int]] = mapped_column(default=0)
    pessoas_doencas_cronicas: Mapped[Optional[bool]] = mapped_column(default=False)
    descricao_doencas_cronicas: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    pessoas_transtornos_mentais: Mapped[Optional[bool]] = mapped_column(default=False)
    descricao_transtornos: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    uso_substancias: Mapped[Optional[bool]] = mapped_column(default=False)
    descricao_uso_substancias: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    acesso_servicos_saude: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="UBS | ESF | CAPS | Hospital | Particular | Nenhum"
    )
    uso_medicamentos_controlados: Mapped[Optional[bool]] = mapped_column(default=False)
    observacoes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    family = relationship("Family", backref="condicoes_saude")
    profissional = relationship("Professional")


class CondicoesEducacionais(Base, TimestampMixin):
    """Condicoes educacionais da familia conforme Prontuario SUAS."""

    __tablename__ = "condicoes_educacionais"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    data_coleta: Mapped[date] = mapped_column(Date, nullable=False)
    profissional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    alfabetizacao_familiar: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Todos_alfabetizados | Parcialmente | Nenhum"
    )
    membros_distorcao_idade_serie: Mapped[Optional[int]] = mapped_column(default=0)
    membros_fora_escola: Mapped[Optional[int]] = mapped_column(default=0)
    detalhe_fora_escola: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    membros_creche_pre_escola: Mapped[Optional[int]] = mapped_column(default=0)
    acesso_educacao_infantil: Mapped[Optional[bool]] = mapped_column(default=False)
    observacoes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    family = relationship("Family", backref="condicoes_educacionais")
    profissional = relationship("Professional")


class ConvivenciaFamiliar(Base, TimestampMixin):
    """Convivência familiar e comunitaria conforme Prontuario SUAS."""

    __tablename__ = "convivencia_familiar"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    data_coleta: Mapped[date] = mapped_column(Date, nullable=False)
    profissional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    relacionamento_familiar: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Harmonioso | Conflituoso | Rompido"
    )
    presenca_violencia_domestica: Mapped[Optional[bool]] = mapped_column(default=False)
    presenca_trabalho_infantil: Mapped[Optional[bool]] = mapped_column(default=False)
    medidas_protetivas: Mapped[Optional[bool]] = mapped_column(default=False)
    detalhe_medidas_protetivas: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    participacao_comunitaria: Mapped[Optional[bool]] = mapped_column(default=False)
    detalhe_participacao: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    vinculos_comunitarios: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True,
        comment="Fortalecidos | Fraqeis | Inexistentes"
    )
    observacoes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    family = relationship("Family", backref="convivencia_familiar")
    profissional = relationship("Professional")


class VulnerabilidadeFamiliar(Base, TimestampMixin):
    """Registro de situacoes de vulnerabilidade com controle de datas."""

    __tablename__ = "vulnerabilidades_familiares"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(
        String(40), nullable=False,
        comment="Pobreza | Extrema_pobreza | Inseguranca_alimentar | Trabalho_infantil | "
                "Violencia_domestica | Abuso_sexual | Negligencia | Abandono | "
                "Rua | Migracao_forcada | Catastrofe | Desemprego | Outro"
    )
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_saida: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    profissional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )
    observacoes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    family = relationship("Family", backref="vulnerabilidades")


class PotencialidadeFamiliar(Base, TimestampMixin):
    """Potencialidades identificadas na familia."""

    __tablename__ = "potencialidades_familiares"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    descricao: Mapped[str] = mapped_column(String(500), nullable=False)
    data_identificacao: Mapped[date] = mapped_column(Date, nullable=False)
    profissional_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("professionals.id", ondelete="SET NULL"),
        nullable=True,
    )

    family = relationship("Family", backref="potencialidades")
