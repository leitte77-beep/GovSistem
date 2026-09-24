"""Cadastro unificado de pessoas (cidadãos, produtores, empresas) e imóveis.

Decisão registrada em docs/DECISOES.md: o GovSocial mantém o cadastro social em
banco próprio e não expõe uma API de pessoas consumível por outros módulos. Por
isso o GovInfra tem seu próprio cadastro, com `origem_externa` /
`referencia_externa` prontos para conciliação futura — assim uma integração não
exige migração de dados.

Um mesmo cadastro atende caçambas e Porteira Adentro: não há duplicação entre as
duas áreas do módulo.
"""

import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
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
    GeoMixin,
    JSONType,
    Quantidade,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import RelacaoImovel, SituacaoCadastro, TipoImovel


class Pessoa(
    Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin, SoftDeleteMixin, ConcurrencyMixin
):
    """Pessoa física ou jurídica atendida pela Secretaria."""

    __tablename__ = "govinfra_people"
    __table_args__ = (
        # CPF/CNPJ é único por organização quando informado. Cadastro sem
        # documento é permitido (atendimento emergencial), mas fica sinalizado.
        UniqueConstraint("organizacao_id", "documento", name="uq_govinfra_pessoa_documento"),
        Index("ix_govinfra_pessoa_busca", "organizacao_id", "busca"),
        Index("ix_govinfra_pessoa_telefone", "organizacao_id", "telefone"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )

    nome: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    nome_social: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Só dígitos: CPF (11) ou CNPJ (14). A formatação é responsabilidade da tela.
    documento: Mapped[str | None] = mapped_column(String(14), nullable=True, index=True)
    pessoa_juridica: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rg: Mapped[str | None] = mapped_column(String(30), nullable=True)
    orgao_expedidor: Mapped[str | None] = mapped_column(String(30), nullable=True)
    data_nascimento: Mapped[date | None] = mapped_column(Date, nullable=True)

    telefone: Mapped[str | None] = mapped_column(String(11), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(11), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)

    cep: Mapped[str | None] = mapped_column(String(8), nullable=True)
    logradouro: Mapped[str | None] = mapped_column(String(200), nullable=True)
    numero: Mapped[str | None] = mapped_column(String(20), nullable=True)
    complemento: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bairro: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    municipio: Mapped[str | None] = mapped_column(String(120), nullable=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)

    # Uma pessoa pode ter várias classificações ao mesmo tempo (item 8.3).
    tipos: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    situacao: Mapped[str] = mapped_column(
        String(30), default=SituacaoCadastro.ATIVO.value, nullable=False, index=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Chave normalizada (sem acento, sem pontuação) para a busca tolerante.
    busca: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Conciliação futura com o cadastro social / outro sistema municipal.
    origem_externa: Mapped[str | None] = mapped_column(String(40), nullable=True)
    referencia_externa: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)

    imoveis: Mapped[list["PessoaImovel"]] = relationship(
        back_populates="pessoa", cascade="all, delete-orphan", lazy="selectin"
    )


class Imovel(
    Base,
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    ActorMixin,
    SoftDeleteMixin,
    ConcurrencyMixin,
    GeoMixin,
):
    """Imóvel urbano ou propriedade rural atendida."""

    __tablename__ = "govinfra_properties"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "codigo", name="uq_govinfra_imovel_codigo"),
        Index("ix_govinfra_imovel_busca", "organizacao_id", "busca"),
        Index("ix_govinfra_imovel_geo", "latitude", "longitude"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    codigo: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    nome: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tipo: Mapped[str] = mapped_column(
        String(20), default=TipoImovel.URBANO.value, nullable=False, index=True
    )

    proprietario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_people.id", ondelete="SET NULL"), nullable=True, index=True
    )
    solicitante_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_people.id", ondelete="SET NULL"), nullable=True, index=True
    )
    relacao_solicitante: Mapped[str | None] = mapped_column(String(30), nullable=True)

    cep: Mapped[str | None] = mapped_column(String(8), nullable=True)
    logradouro: Mapped[str | None] = mapped_column(String(200), nullable=True)
    numero: Mapped[str | None] = mapped_column(String(20), nullable=True)
    complemento: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bairro: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    comunidade: Mapped[str | None] = mapped_column(String(150), nullable=True, index=True)
    estrada_acesso: Mapped[str | None] = mapped_column(String(200), nullable=True)
    municipio: Mapped[str | None] = mapped_column(String(120), nullable=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)
    regiao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_regioes.id", ondelete="SET NULL"), nullable=True, index=True
    )

    lote: Mapped[str | None] = mapped_column(String(40), nullable=True)
    matricula: Mapped[str | None] = mapped_column(String(60), nullable=True)
    inscricao_municipal: Mapped[str | None] = mapped_column(String(60), nullable=True)
    cadastro_rural: Mapped[str | None] = mapped_column(String(60), nullable=True, doc="CAR/INCRA")
    area_hectares: Mapped[float | None] = mapped_column(Quantidade, nullable=True)
    atividade_produtiva: Mapped[str | None] = mapped_column(String(200), nullable=True)

    instrucoes_acesso: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    situacao: Mapped[str] = mapped_column(
        String(30), default=SituacaoCadastro.ATIVO.value, nullable=False, index=True
    )
    busca: Mapped[str | None] = mapped_column(String(600), nullable=True)

    # Endereço normalizado — base da regra "um atendimento por endereço/dia".
    endereco_chave: Mapped[str | None] = mapped_column(String(300), nullable=True, index=True)

    vinculos: Mapped[list["PessoaImovel"]] = relationship(
        back_populates="imovel", cascade="all, delete-orphan", lazy="selectin"
    )


class PessoaImovel(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Vínculo N:N entre pessoa e imóvel, com a relação (item 9)."""

    __tablename__ = "govinfra_person_properties"
    __table_args__ = (
        UniqueConstraint("pessoa_id", "imovel_id", "relacao", name="uq_govinfra_pessoa_imovel"),
    )

    pessoa_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_people.id", ondelete="CASCADE"), nullable=False, index=True
    )
    imovel_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relacao: Mapped[str] = mapped_column(
        String(30), default=RelacaoImovel.PROPRIETARIO.value, nullable=False
    )
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    observacao: Mapped[str | None] = mapped_column(String(300), nullable=True)

    pessoa: Mapped["Pessoa"] = relationship(back_populates="imoveis", lazy="joined")
    imovel: Mapped["Imovel"] = relationship(back_populates="vinculos", lazy="joined")
