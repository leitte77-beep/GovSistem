"""Validacao de integridade: nenhum trecho pode ser perdido, duplicado ou
alterado entre o texto original, os blocos e o HTML renderizado.

Ignora apenas diferencas de espacos/quebras de layout e caracteres
invisiveis removidos pelo sanitizador. Palavras, numeros, datas, valores,
nomes, CPF/CNPJ e pontuacao sao comparados token a token.
"""

import difflib

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from app.services.gazette.types import Block, ParsedDocument


class IntegrityReport(BaseModel):
    ok: bool = True
    missing: list[str] = Field(default_factory=list)
    added: list[str] = Field(default_factory=list)
    messages: list[str] = Field(default_factory=list)


def _tokens(text: str) -> list[str]:
    return text.split()


def _blocks_text(blocks: list[Block]) -> str:
    parts: list[str] = []
    for block in blocks:
        for item in block.iter_all():
            parts.append(item.original_text)
    return "\n".join(parts)


def _rendered_text(rendered_html: str) -> str:
    soup = BeautifulSoup(rendered_html, "html.parser")
    return soup.get_text("\n")


def _diff(expected: list[str], actual: list[str]) -> tuple[list[str], list[str]]:
    missing: list[str] = []
    added: list[str] = []
    matcher = difflib.SequenceMatcher(a=expected, b=actual, autojunk=False)
    for op, a1, a2, b1, b2 in matcher.get_opcodes():
        if op in ("delete", "replace"):
            missing.extend(expected[a1:a2])
        if op in ("insert", "replace"):
            added.extend(actual[b1:b2])
    return missing, added


def verify_integrity(
    document: ParsedDocument, rendered_html: str
) -> IntegrityReport:
    report = IntegrityReport()

    original_tokens = _tokens(document.normalized_text)
    blocks_tokens = _tokens(_blocks_text(document.blocks))
    rendered_tokens = _tokens(_rendered_text(rendered_html))

    # Rotulos de campos sao renderizados como "Label: valor" — mesma sequencia
    # de tokens, entao a comparacao token a token permanece valida.

    missing, added = _diff(original_tokens, blocks_tokens)
    if missing or added:
        report.ok = False
        report.missing.extend(missing[:20])
        report.added.extend(added[:20])
        report.messages.append(
            "Divergência entre o texto original e os blocos classificados."
        )

    missing_r, added_r = _diff(blocks_tokens, rendered_tokens)
    if missing_r or added_r:
        report.ok = False
        report.missing.extend(missing_r[:20])
        report.added.extend(added_r[:20])
        report.messages.append(
            "Divergência entre os blocos classificados e o conteúdo renderizado."
        )

    if report.ok:
        report.messages.append("Integridade verificada: nenhum conteúdo perdido.")
    return report
