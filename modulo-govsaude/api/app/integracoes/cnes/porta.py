"""Porta da importação CNES (arquivo oficial, nunca scraping).

O artefato oficial é colocado em ``scripts/dados_oficiais/cnes`` e descrito
por um manifesto em ``app/integracoes/especificacoes/cnes/<versao>/``. O
manifesto apenas mapeia nomes de colunas do arquivo oficial; o layout em si
não é inventado pelo sistema.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ManifestoCNES:
    versao_layout: str
    entidade: str
    arquivo: str
    mapeamento: dict[str, str]
    encoding: str = "utf-8-sig"
    delimitador: str = ";"
    competencia: str | None = None
    origem: str | None = None


@dataclass
class RegistroCNES:
    linha: int
    entidade: str
    dados: dict[str, str]


@dataclass
class InconsistenciaCNES:
    linha: int
    campo: str
    valor: str | None
    motivo: str
    acao_sugerida: str


@dataclass
class LeituraCNES:
    status: str
    manifesto: ManifestoCNES | None = None
    registros: list[RegistroCNES] = field(default_factory=list)
    inconsistencias: list[InconsistenciaCNES] = field(default_factory=list)
    arquivo_nome: str | None = None
    hash_arquivo: str | None = None
    total_linhas: int = 0
    mensagem: str | None = None


class PortaImportacaoCNES(Protocol):
    def carregar(self, versao_layout: str | None = None) -> LeituraCNES:
        ...
