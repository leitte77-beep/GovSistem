"""Importa uma tabela auxiliar do TCE-PR (SIM-AM) para `simam_referencias`.

As tabelas (ModeloVeiculoFIPE, TipoObjetoDespesa, TipoCategoriaObjetoDespesa...)
são publicadas pelo TCE. Exporte para CSV com as colunas código e descrição
(uma terceira coluna opcional vai para `extra`) e rode:

    docker compose -f infra/docker-compose.yml run --rm --no-deps -v $PWD/tabela.csv:/tmp/t.csv \
        govfrota-api python scripts/importar_tabelas_simam.py ModeloVeiculoFIPE /tmp/t.csv

A tabela é substituída por inteiro. Separador ";" ou "," (detectado); a primeira
linha é ignorada se não começar com um código numérico/alfanumérico curto
(cabeçalho). Aceita UTF-8 ou Windows-1252.
"""

import asyncio
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete  # noqa: E402

from app.core.database import async_session  # noqa: E402
from app.models.simam import SimamReferencia  # noqa: E402


def ler(caminho: Path) -> list[tuple[str, str, str | None]]:
    bruto = caminho.read_bytes()
    try:
        texto = bruto.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = bruto.decode("cp1252")
    dialeto = csv.Sniffer().sniff(texto[:4096], delimiters=";,")
    linhas = []
    for i, row in enumerate(csv.reader(texto.splitlines(), dialeto)):
        if len(row) < 2 or not row[0].strip():
            continue
        codigo, descricao = row[0].strip(), row[1].strip()
        if i == 0 and not any(ch.isdigit() for ch in codigo):
            continue  # cabeçalho
        extra = row[2].strip() if len(row) > 2 and row[2].strip() else None
        linhas.append((codigo[:20], descricao[:250], (extra or None) and extra[:250]))
    return linhas


async def main(tabela: str, caminho: Path) -> None:
    linhas = ler(caminho)
    if not linhas:
        raise SystemExit("Nenhuma linha lida do CSV.")
    async with async_session() as db:
        await db.execute(delete(SimamReferencia).where(SimamReferencia.tabela == tabela))
        vistos = set()
        for codigo, descricao, extra in linhas:
            if codigo in vistos:
                continue
            vistos.add(codigo)
            db.add(SimamReferencia(tabela=tabela, codigo=codigo, descricao=descricao, extra=extra))
        await db.commit()
    print(f"{tabela}: {len(vistos)} códigos importados.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    asyncio.run(main(sys.argv[1], Path(sys.argv[2])))
