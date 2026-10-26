"""Exportação de relatórios em formatos abertos (B.12-055).

JSON (padrão), CSV (UTF-8 com BOM, separador `;`), XLSX e PDF (WeasyPrint),
com orientação de página. Recebe linhas já filtradas por permissão/sigilo:
este módulo só formata.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from html import escape
from typing import Literal

from fastapi import Response

Formato = Literal["json", "csv", "xlsx", "pdf"]
Orientacao = Literal["retrato", "paisagem"]
MIMES = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}


def _texto(valor) -> str:
    if valor is None:
        return ""
    if isinstance(valor, datetime | date):
        return valor.isoformat()
    if isinstance(valor, list | tuple):
        return ", ".join(_texto(v) for v in valor)
    if isinstance(valor, dict):
        return "; ".join(f"{k}: {_texto(v)}" for k, v in valor.items())
    return str(valor)


def _csv(colunas, linhas) -> bytes:
    saida = io.StringIO()
    escritor = csv.writer(saida, delimiter=";")
    escritor.writerow([r for _, r in colunas])
    for linha in linhas:
        escritor.writerow([_texto(linha.get(c)) for c, _ in colunas])
    return ("﻿" + saida.getvalue()).encode("utf-8")


def _xlsx(titulo, colunas, linhas) -> bytes:
    from openpyxl import Workbook

    livro = Workbook()
    folha = livro.active
    folha.title = titulo[:31] or "Relatório"
    folha.append([r for _, r in colunas])
    for linha in linhas:
        folha.append([_texto(linha.get(c)) for c, _ in colunas])
    saida = io.BytesIO()
    livro.save(saida)
    return saida.getvalue()


def html_tabela(titulo: str, colunas, linhas, rodape: str | None = None) -> str:
    cab = "".join(f"<th>{escape(r)}</th>" for _, r in colunas)
    corpo = "".join(
        "<tr>" + "".join(f"<td>{escape(_texto(linha_.get(c)))}</td>" for c, _ in colunas) + "</tr>"
        for linha_ in linhas
    )
    return (
        f"<h1>{escape(titulo)}</h1><table><thead><tr>{cab}</tr></thead>"
        f"<tbody>{corpo}</tbody></table>"
        + (f"<p class='rodape'>{escape(rodape)}</p>" if rodape else "")
    )


def pdf(html_corpo: str, orientacao: Orientacao = "retrato") -> bytes:
    from weasyprint import HTML

    pagina = "A4 landscape" if orientacao == "paisagem" else "A4"
    estilo = (
        f"@page {{ size: {pagina}; margin: 1.5cm; }}"
        "body { font-family: sans-serif; font-size: 9pt; }"
        "h1 { font-size: 13pt; } h2 { font-size: 11pt; margin-top: 12pt; }"
        "table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }"
        "th, td { border: 1px solid #999; padding: 3px; text-align: left; vertical-align: top; }"
        "th { background: #eee; } .rodape { color: #555; font-size: 8pt; }"
    )
    documento = (
        f"<html><head><meta charset='utf-8'><style>{estilo}</style></head>"
        f"<body>{html_corpo}</body></html>"
    )
    return HTML(string=documento).write_pdf()


def responder(
    titulo: str,
    colunas: list[tuple[str, str]],
    linhas: list[dict],
    formato: Formato = "json",
    orientacao: Orientacao = "retrato",
    extra: dict | None = None,
):
    """``colunas`` é [(chave, rótulo)]. JSON devolve também ``extra``."""
    if formato == "json":
        return {"titulo": titulo, "linhas": linhas, **(extra or {})}
    nome = titulo.lower().replace(" ", "-")[:60]
    if formato == "csv":
        conteudo = _csv(colunas, linhas)
    elif formato == "xlsx":
        conteudo = _xlsx(titulo, colunas, linhas)
    else:
        conteudo = pdf(html_tabela(titulo, colunas, linhas), orientacao)
    return Response(
        content=conteudo,
        media_type=MIMES[formato],
        headers={
            "Content-Disposition": f'attachment; filename="{nome}.{formato}"',
            "Cache-Control": "no-store",
        },
    )
