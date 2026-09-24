"""Título de publicação exibido na edição (página pública e PDF).

A matéria guarda o nome do ato ("PORTARIA") e a numeração oficial em campos
separados (``act_number``/``act_year``), emitida no fechamento. O leitor do
Diário, porém, identifica o ato pelo título COM a numeração
("PORTARIA Nº 232/2026") — é assim que ele é citado, indexado e recuperado.

Este módulo compõe esse título a partir do item já congelado no snapshot, sem
alterar o snapshot: a numeração publicada continua sendo a que foi assinada.
"""

from __future__ import annotations

import re

__all__ = ["display_title"]


def _has_number(title: str, number: str) -> bool:
    return bool(re.search(rf"(?<!\d){re.escape(number)}(?!\d)", title))


# "PORTARIA Nº 12/2026", "EDITAL N. 3-2026", "AVISO 7/2026": o título já se
# identifica sozinho.
_NUMBERED_TITLE_RE = re.compile(
    r"(?:n[º°.\s]\s*\d|\b\d{1,6}\s*[/-]\s*\d{2,4}\b)", re.IGNORECASE
)


def display_title(item: dict) -> str:
    """Título do ato com a numeração oficial, quando houver.

    Devolve o título como está quando não há numeração emitida ou quando ele
    já traz uma numeração — seja a mesma, seja outra que identifique o ato (um
    aviso de dispensa, por exemplo, é citado pelo número do procedimento, e
    acrescentar o número sequencial da publicação produziria o absurdo
    "AVISO ... Nº 47/2026 Nº 16/2026").
    """
    title = (item.get("title") or "").strip() or "Matéria"
    number = item.get("act_number")
    number = "" if number is None else str(number).strip()
    if not number or _has_number(title, number) or _NUMBERED_TITLE_RE.search(title):
        return title
    year = item.get("act_year")
    year = "" if year is None else str(year).strip()
    suffix = f"Nº {number}/{year}" if year else f"Nº {number}"
    return f"{title} {suffix}"
