"""Adaptador CNES orientado por manifesto de layout oficial.

Não há posições/colunas fixas aqui. O manifesto declara a versão do layout,
a entidade (estabelecimentos, equipes, profissionais ou vinculos), o arquivo e
o mapeamento ``campo_interno -> coluna_oficial``. Sem manifesto ou arquivo, o
resultado é ``PENDENTE_ESPECIFICACAO_OFICIAL``.
"""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

from app.integracoes.cnes.porta import (
    InconsistenciaCNES,
    LeituraCNES,
    ManifestoCNES,
    RegistroCNES,
)

DIRETORIO_ESPECIFICACOES = (
    Path(__file__).resolve().parents[1] / "especificacoes" / "cnes"
)
DIRETORIO_DADOS = Path(__file__).resolve().parents[3] / "scripts" / "dados_oficiais" / "cnes"

STATUS_PENDENTE = "PENDENTE_ESPECIFICACAO_OFICIAL"


def _manifestos() -> list[Path]:
    if not DIRETORIO_ESPECIFICACOES.exists():
        return []
    return sorted(DIRETORIO_ESPECIFICACOES.glob("*/manifest.json"))


def _ler_manifesto(caminho: Path) -> ManifestoCNES:
    bruto = json.loads(caminho.read_text(encoding="utf-8"))
    return ManifestoCNES(
        versao_layout=str(bruto["versao_layout"]),
        entidade=str(bruto["entidade"]),
        arquivo=str(bruto["arquivo"]),
        mapeamento={str(k): str(v) for k, v in dict(bruto["mapeamento"]).items()},
        encoding=str(bruto.get("encoding", "utf-8-sig")),
        delimitador=str(bruto.get("delimitador", ";")),
        competencia=bruto.get("competencia"),
        origem=bruto.get("origem"),
    )


class AdaptadorCNESManifesto:
    sistema = "CNES"

    def carregar(self, versao_layout: str | None = None) -> LeituraCNES:
        manifestos = _manifestos()
        if versao_layout:
            manifestos = [
                caminho for caminho in manifestos if caminho.parent.name == versao_layout
            ]
        if not manifestos:
            return LeituraCNES(
                status=STATUS_PENDENTE,
                mensagem=(
                    "Manifesto de layout oficial do CNES ausente. Coloque o artefato "
                    "oficial e o manifesto em app/integracoes/especificacoes/cnes/."
                ),
            )
        try:
            manifesto = _ler_manifesto(manifestos[0])
        except Exception as exc:  # noqa: BLE001 - manifesto inválido é pendência
            return LeituraCNES(
                status=STATUS_PENDENTE,
                mensagem=f"Manifesto CNES inválido: {exc.__class__.__name__}.",
            )
        caminho = DIRETORIO_DADOS / manifesto.arquivo
        if not caminho.exists():
            return LeituraCNES(
                status=STATUS_PENDENTE,
                manifesto=manifesto,
                arquivo_nome=manifesto.arquivo,
                mensagem=(
                    f"Arquivo oficial {caminho} ausente. Obtenha-o na fonte oficial "
                    "e registre a competência em docs/pendencias-oficiais.md."
                ),
            )
        conteudo = caminho.read_bytes()
        hash_arquivo = hashlib.sha256(conteudo).hexdigest()
        if not manifesto.mapeamento:
            return LeituraCNES(
                status=STATUS_PENDENTE,
                manifesto=manifesto,
                arquivo_nome=manifesto.arquivo,
                hash_arquivo=hash_arquivo,
                mensagem="Manifesto sem mapeamento de colunas.",
            )
        registros: list[RegistroCNES] = []
        inconsistencias: list[InconsistenciaCNES] = []
        with caminho.open(
            "r", encoding=manifesto.encoding, newline=""
        ) as arquivo:
            leitor = csv.DictReader(arquivo, delimiter=manifesto.delimitador)
            if not leitor.fieldnames:
                return LeituraCNES(
                    status=STATUS_PENDENTE,
                    manifesto=manifesto,
                    arquivo_nome=manifesto.arquivo,
                    hash_arquivo=hash_arquivo,
                    mensagem="Arquivo oficial sem cabeçalho.",
                )
            colunas = {nome.strip() for nome in leitor.fieldnames if nome}
            for interno, externo in manifesto.mapeamento.items():
                if externo not in colunas:
                    inconsistencias.append(
                        InconsistenciaCNES(
                            linha=1,
                            campo=interno,
                            valor=externo,
                            motivo="Coluna mapeada ausente no cabeçalho oficial.",
                            acao_sugerida="Conferir a versão do layout/manifesto.",
                        )
                    )
            if inconsistencias:
                return LeituraCNES(
                    status=STATUS_PENDENTE,
                    manifesto=manifesto,
                    arquivo_nome=manifesto.arquivo,
                    hash_arquivo=hash_arquivo,
                    inconsistencias=inconsistencias,
                    mensagem="Layout do arquivo não confere com o manifesto.",
                )
            total = 0
            for indice, linha in enumerate(leitor, start=2):
                total += 1
                dados = {
                    interno: (linha.get(externo) or "").strip()
                    for interno, externo in manifesto.mapeamento.items()
                }
                registros.append(
                    RegistroCNES(
                        linha=indice,
                        entidade=manifesto.entidade,
                        dados=dados,
                    )
                )
        return LeituraCNES(
            status="LIDO",
            manifesto=manifesto,
            registros=registros,
            arquivo_nome=manifesto.arquivo,
            hash_arquivo=hash_arquivo,
            total_linhas=total,
        )
