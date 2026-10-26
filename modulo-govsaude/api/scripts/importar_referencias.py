"""Importa tabelas nacionais oficiais para o schema ``referencia``.

Os arquivos devem ser obtidos nas fontes oficiais e colocados em
``scripts/dados_oficiais`` com os nomes abaixo. O script NÃO inventa dados:
arquivo ausente vira pendência registrada no stdout e em
``docs/pendencias-oficiais.md`` (mantido manualmente até a importação).

Uso:
    python scripts/importar_referencias.py [--somente municipios,cbo,...]
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import async_session  # noqa: E402
from app.core.fonetica import normalizar_busca  # noqa: E402
from app.models.referencia import (  # noqa: E402
    Cbo,
    Cep,
    Ciap2,
    Cid10,
    Cnae,
    CnesEstabelecimento,
    Imunobiologico,
    Medicamento,
    MunicipioIBGE,
    SigtapProcedimento,
    VersaoReferencia,
)

BASE = Path(__file__).resolve().parent / "dados_oficiais"

ARQUIVOS = {
    "municipios": "municipios.csv",
    "cbo": "cbo.csv",
    "cid10": "cid10.csv",
    "ciap2": "ciap2.csv",
    "cnae": "cnae.csv",
    "ceps": "ceps.csv",
    "cnes": "cnes_estabelecimentos.csv",
    "sigtap": "sigtap.csv",
    "imunobiologicos": "imunobiologicos.csv",
    "medicamentos": "medicamentos.csv",
}


def _hash(caminho: Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()


def _linhas(nome: str) -> list[dict[str, str]]:
    caminho = BASE / ARQUIVOS[nome]
    if not caminho.exists():
        print(
            f"PENDENTE_ESPECIFICACAO_OFICIAL: {nome} — arquivo {caminho} ausente. "
            "Obtenha o artefato oficial e registre a versão em docs/pendencias-oficiais.md."
        )
        return []
    with caminho.open("r", encoding="utf-8-sig", newline="") as arquivo:
        return list(csv.DictReader(arquivo))


async def _importar(nome: str) -> None:
    linhas = _linhas(nome)
    if not linhas:
        return
    caminho = BASE / ARQUIVOS[nome]
    async with async_session() as db:
        if nome == "municipios":
            for linha in linhas:
                codigo = (linha.get("codigo_ibge") or linha.get("id") or "").strip()
                if not codigo:
                    continue
                await db.merge(
                    MunicipioIBGE(
                        codigo_ibge=codigo,
                        nome=linha["nome"].strip(),
                        uf=linha["uf"].strip().upper(),
                        nome_busca=normalizar_busca(linha["nome"]),
                        ativo=True,
                    )
                )
        elif nome == "cbo":
            for linha in linhas:
                await db.merge(
                    Cbo(
                        codigo=linha["codigo"].strip(),
                        descricao=linha["descricao"].strip(),
                        familia=linha.get("familia"),
                        ativo=True,
                    )
                )
        elif nome == "cid10":
            for linha in linhas:
                await db.merge(
                    Cid10(
                        codigo=linha["codigo"].strip().upper(),
                        descricao=linha["descricao"].strip(),
                        capitulo=linha.get("capitulo"),
                        grupo=linha.get("grupo"),
                        ativo=True,
                    )
                )
        elif nome == "ciap2":
            for linha in linhas:
                await db.merge(
                    Ciap2(
                        codigo=linha["codigo"].strip().upper(),
                        descricao=linha["descricao"].strip(),
                        grupo=linha.get("grupo"),
                        ativo=True,
                    )
                )
        elif nome == "cnae":
            for linha in linhas:
                await db.merge(
                    Cnae(
                        codigo=linha["codigo"].strip(),
                        descricao=linha["descricao"].strip(),
                        secao=linha.get("secao"),
                        ativo=True,
                    )
                )
        elif nome == "ceps":
            for linha in linhas:
                cep = (linha.get("cep") or "").strip()
                if not cep:
                    continue
                await db.merge(
                    Cep(
                        cep="".join(ch for ch in cep if ch.isdigit()),
                        logradouro=linha.get("logradouro"),
                        bairro=linha.get("bairro"),
                        municipio_ibge=linha.get("municipio_ibge"),
                        uf=linha.get("uf"),
                        ativo=True,
                    )
                )
        elif nome == "cnes":
            for linha in linhas:
                codigo = (linha.get("codigo_cnes") or linha.get("cnes") or "").strip()
                competencia = (
                    linha.get("competencia") or date.today().strftime("%Y%m")
                ).strip()
                if not codigo:
                    continue
                await db.merge(
                    CnesEstabelecimento(
                        codigo_cnes=codigo,
                        competencia=competencia,
                        nome=(linha.get("nome") or "").strip() or codigo,
                        tipo=linha.get("tipo"),
                        municipio_ibge=linha.get("municipio_ibge"),
                        ativo=True,
                    )
                )
        elif nome == "sigtap":
            for linha in linhas:
                await db.merge(
                    SigtapProcedimento(
                        codigo=linha["codigo"].strip(),
                        competencia=linha["competencia"].strip(),
                        nome=linha["nome"].strip(),
                        complexidade=linha.get("complexidade"),
                        financiamento=linha.get("financiamento"),
                        valor_ambulatorial=linha.get("valor_ambulatorial"),
                        valor_hospitalar=linha.get("valor_hospitalar"),
                        ativo=True,
                    )
                )
        elif nome == "imunobiologicos":
            for linha in linhas:
                await db.merge(
                    Imunobiologico(
                        codigo=linha["codigo"].strip(),
                        nome=linha["nome"].strip(),
                        apresentacao=linha.get("apresentacao"),
                        via_administracao=linha.get("via_administracao"),
                        ativo=True,
                    )
                )
        elif nome == "medicamentos":
            for linha in linhas:
                await db.merge(
                    Medicamento(
                        codigo_obm=linha["codigo_obm"].strip(),
                        nome=linha["nome"].strip(),
                        principio_ativo=linha.get("principio_ativo"),
                        apresentacao=linha.get("apresentacao"),
                        renome=str(linha.get("renome", "")).lower() in {"1", "true", "sim"},
                        ativo=True,
                    )
                )
        competencia = linhas[0].get("competencia") if linhas else None
        await db.merge(
            VersaoReferencia(
                sistema=nome.upper(),
                versao=competencia or date.today().isoformat(),
                competencia=competencia,
                arquivo_origem=str(caminho),
                hash_arquivo=_hash(caminho),
                importado_em=date.today(),
            )
        )
        await db.commit()
    print(f"Importado {nome}: {len(linhas)} registros.")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--somente", default="")
    args = parser.parse_args()
    selecionados = [s.strip() for s in args.somente.split(",") if s.strip()] or list(ARQUIVOS)
    for nome in selecionados:
        if nome not in ARQUIVOS:
            raise SystemExit(f"Tabela desconhecida: {nome}")
        await _importar(nome)


if __name__ == "__main__":
    asyncio.run(main())
