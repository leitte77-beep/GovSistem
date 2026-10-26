"""Tabelas nacionais de referência (schema ``referencia``, somente leitura).

Nenhum conteúdo é inventado: os scripts de importação leem arquivos oficiais
colocados em ``scripts/dados_oficiais``. Enquanto um arquivo não estiver
presente, o script registra a pendência e não cria dados fictícios em
produção. A suíte de testes pode semear recortes explicitamente marcados
como FICTÍCIOS.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import Boolean, Date, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.models.base import Base

SCHEMA = (
    None
    if settings.DATABASE_URL.startswith("sqlite")
    else settings.REFERENCIA_SCHEMA
)


class MunicipioIBGE(Base):
    __tablename__ = "municipios_ibge"
    __table_args__ = (
        Index("ix_municipios_ibge_uf_nome", "uf", "nome"),
        {"schema": SCHEMA},
    )

    codigo_ibge: Mapped[str] = mapped_column(String(7), primary_key=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    uf: Mapped[str] = mapped_column(String(2), nullable=False)
    nome_busca: Mapped[str | None] = mapped_column(String(160), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Cbo(Base):
    __tablename__ = "cbo"
    __table_args__ = ({"schema": SCHEMA},)

    codigo: Mapped[str] = mapped_column(String(6), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(240), nullable=False)
    familia: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Cid10(Base):
    __tablename__ = "cid10"
    __table_args__ = (Index("ix_cid10_descricao", "descricao"), {"schema": SCHEMA})

    codigo: Mapped[str] = mapped_column(String(10), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(400), nullable=False)
    capitulo: Mapped[str | None] = mapped_column(String(10), nullable=True)
    grupo: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Ciap2(Base):
    __tablename__ = "ciap2"
    __table_args__ = ({"schema": SCHEMA},)

    codigo: Mapped[str] = mapped_column(String(10), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(400), nullable=False)
    grupo: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Cnae(Base):
    __tablename__ = "cnae"
    __table_args__ = ({"schema": SCHEMA},)

    codigo: Mapped[str] = mapped_column(String(9), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(400), nullable=False)
    secao: Mapped[str | None] = mapped_column(String(5), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SigtapProcedimento(Base):
    __tablename__ = "sigtap_procedimentos"
    __table_args__ = (
        Index("ix_sigtap_competencia", "competencia"),
        {"schema": SCHEMA},
    )

    codigo: Mapped[str] = mapped_column(String(10), primary_key=True)
    competencia: Mapped[str] = mapped_column(String(6), primary_key=True)
    nome: Mapped[str] = mapped_column(String(300), nullable=False)
    complexidade: Mapped[str | None] = mapped_column(String(30), nullable=True)
    financiamento: Mapped[str | None] = mapped_column(String(60), nullable=True)
    valor_ambulatorial: Mapped[str | None] = mapped_column(String(30), nullable=True)
    valor_hospitalar: Mapped[str | None] = mapped_column(String(30), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Imunobiologico(Base):
    __tablename__ = "imunobiologicos"
    __table_args__ = ({"schema": SCHEMA},)

    codigo: Mapped[str] = mapped_column(String(20), primary_key=True)
    nome: Mapped[str] = mapped_column(String(240), nullable=False)
    apresentacao: Mapped[str | None] = mapped_column(String(120), nullable=True)
    via_administracao: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Medicamento(Base):
    __tablename__ = "medicamentos"
    __table_args__ = (Index("ix_medicamentos_nome", "nome"), {"schema": SCHEMA})

    codigo_obm: Mapped[str] = mapped_column(String(30), primary_key=True)
    nome: Mapped[str] = mapped_column(String(300), nullable=False)
    principio_ativo: Mapped[str | None] = mapped_column(String(300), nullable=True)
    apresentacao: Mapped[str | None] = mapped_column(String(200), nullable=True)
    renome: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CnesEstabelecimento(Base):
    """Recorte oficial do CNES usado para validar/importar estabelecimentos.

    A tabela é preenchida exclusivamente pelo importador de arquivo oficial.
    Enquanto estiver vazia, a validação de CNES é apenas estrutural.
    """

    __tablename__ = "cnes_estabelecimentos"
    __table_args__ = (
        Index("ix_cnes_estabelecimentos_municipio", "municipio_ibge"),
        {"schema": SCHEMA},
    )

    codigo_cnes: Mapped[str] = mapped_column(String(7), primary_key=True)
    competencia: Mapped[str] = mapped_column(String(6), primary_key=True)
    nome: Mapped[str] = mapped_column(String(240), nullable=False)
    tipo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    municipio_ibge: Mapped[str | None] = mapped_column(String(7), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Cep(Base):
    __tablename__ = "ceps"
    __table_args__ = (
        Index("ix_ceps_municipio", "municipio_ibge"),
        {"schema": SCHEMA},
    )

    cep: Mapped[str] = mapped_column(String(8), primary_key=True)
    logradouro: Mapped[str | None] = mapped_column(String(240), nullable=True)
    bairro: Mapped[str | None] = mapped_column(String(120), nullable=True)
    municipio_ibge: Mapped[str | None] = mapped_column(String(7), nullable=True)
    uf: Mapped[str | None] = mapped_column(String(2), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class VersaoReferencia(Base):
    __tablename__ = "versoes_referencia"
    __table_args__ = ({"schema": SCHEMA},)

    sistema: Mapped[str] = mapped_column(String(40), primary_key=True)
    versao: Mapped[str] = mapped_column(String(40), primary_key=True)
    competencia: Mapped[str | None] = mapped_column(String(6), nullable=True)
    vigencia_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    arquivo_origem: Mapped[str | None] = mapped_column(String(300), nullable=True)
    hash_arquivo: Mapped[str | None] = mapped_column(String(64), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    importado_em: Mapped[date | None] = mapped_column(Date, nullable=True)


__all__ = [
    "Cbo",
    "Cep",
    "Ciap2",
    "Cid10",
    "Cnae",
    "CnesEstabelecimento",
    "Imunobiologico",
    "Medicamento",
    "MunicipioIBGE",
    "SigtapProcedimento",
    "VersaoReferencia",
]
