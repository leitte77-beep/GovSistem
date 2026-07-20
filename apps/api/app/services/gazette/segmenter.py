"""Segmentacao do conteudo colado em unidades de analise (segmentos).

Dois caminhos:
- texto simples: cada linha vira um segmento; linhas consecutivas com TAB
  viram um segmento de tabela reconstruida;
- HTML sanitizado (colagem do Word): cada elemento de bloco vira um ou mais
  segmentos; <table> e preservada como segmento de tabela (prioridade sobre
  reconstrucao por texto).

O texto normalizado do documento e reconstruido a partir dos segmentos, de
modo que os offsets de cada segmento apontem exatamente para o trecho
correspondente.
"""

import html as html_lib
from dataclasses import dataclass, field
from typing import Optional

from bs4 import BeautifulSoup, NavigableString, Tag

from app.services.gazette.normalize import collapse_spaces, normalize_text

BLOCK_LEVEL_TAGS = {
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "blockquote", "pre", "dt", "dd", "hr",
}
CONTAINER_TAGS = {"div", "section", "article", "ul", "ol", "dl", "body", "html"}


@dataclass
class Segment:
    text: str
    start: int = 0
    end: int = 0
    blank_before: bool = False
    kind: str = "text"  # "text" | "table"
    table_html: Optional[str] = None
    bold: bool = False
    metadata: dict = field(default_factory=dict)


def _is_tab_table_line(line: str) -> bool:
    return "\t" in line and len([c for c in line.split("\t") if c.strip()]) >= 2


def _table_html_from_tab_lines(lines: list[str]) -> str:
    rows = []
    for line in lines:
        cells = [html_lib.escape(cell.strip()) for cell in line.split("\t")]
        cells_html = "".join(f"<td>{cell}</td>" for cell in cells)
        rows.append(f"<tr>{cells_html}</tr>")
    return f"<table><tbody>{''.join(rows)}</tbody></table>"


def segment_plain_text(text: str) -> tuple[list[Segment], str]:
    """Segmenta texto simples linha a linha, agrupando tabelas por TAB."""
    normalized = normalize_text(text)
    lines = normalized.split("\n")

    segments: list[Segment] = []
    parts: list[str] = []
    cursor = 0
    blank_pending = False
    i = 0

    def _append(seg_text: str, kind: str = "text", table_html: str | None = None):
        nonlocal cursor, blank_pending
        if parts:
            parts.append("\n")
            cursor += 1
        start = cursor
        parts.append(seg_text)
        cursor += len(seg_text)
        segments.append(
            Segment(
                text=seg_text,
                start=start,
                end=cursor,
                blank_before=blank_pending,
                kind=kind,
                table_html=table_html,
            )
        )
        blank_pending = False

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            blank_pending = True
            i += 1
            continue

        if _is_tab_table_line(line):
            table_lines = []
            while i < len(lines) and _is_tab_table_line(lines[i]):
                table_lines.append(lines[i])
                i += 1
            if len(table_lines) >= 2:
                _append(
                    "\n".join(table_lines),
                    kind="table",
                    table_html=_table_html_from_tab_lines(table_lines),
                )
                continue
            # Linha isolada com TAB nao e tabela: trata como texto comum.
            line = table_lines[0]

        _append(line.strip())
        i += 1

    return segments, "".join(parts)


def _table_text(table: Tag) -> str:
    rows = []
    for tr in table.find_all("tr"):
        cells = [
            collapse_spaces(cell.get_text(" ", strip=True))
            for cell in tr.find_all(["td", "th"])
        ]
        rows.append("\t".join(cells))
    return "\n".join(row for row in rows if row.strip())


def _is_bold(el: Tag) -> bool:
    if el.find(["strong", "b"]) is not None:
        text_len = len(collapse_spaces(el.get_text()))
        bold_len = sum(
            len(collapse_spaces(t.get_text())) for t in el.find_all(["strong", "b"])
        )
        return text_len > 0 and bold_len >= text_len * 0.8
    return False


def _block_lines(el: Tag) -> list[str]:
    """Extrai as linhas de texto de um elemento, respeitando <br>."""
    pieces: list[str] = [""]
    for node in el.descendants:
        if isinstance(node, Tag) and node.name == "br":
            pieces.append("")
        elif isinstance(node, NavigableString):
            pieces[-1] += str(node)
    return [collapse_spaces(p) for p in pieces if collapse_spaces(p)]


def _walk(el: Tag, out: list[Tag]) -> None:
    for child in el.children:
        if not isinstance(child, Tag):
            continue
        if child.name == "table":
            out.append(child)
        elif child.name in BLOCK_LEVEL_TAGS:
            out.append(child)
        elif child.name in CONTAINER_TAGS:
            _walk(child, out)
        else:
            # Elemento inline solto no topo: trata como bloco de texto.
            out.append(child)


def segment_html(sanitized_html: str) -> tuple[list[Segment], str]:
    """Segmenta HTML sanitizado preservando tabelas como blocos nativos."""
    soup = BeautifulSoup(sanitized_html, "html.parser")
    elements: list[Tag] = []
    _walk(soup, elements)

    segments: list[Segment] = []
    parts: list[str] = []
    cursor = 0

    def _append(seg: Segment):
        nonlocal cursor
        if parts:
            parts.append("\n")
            cursor += 1
        seg.start = cursor
        parts.append(seg.text)
        cursor += len(seg.text)
        seg.end = cursor
        segments.append(seg)

    for el in elements:
        if el.name == "table":
            text = normalize_text(_table_text(el))
            if not text:
                continue
            for attr in list(el.attrs):
                if attr not in ("class",):
                    del el.attrs[attr]
            _append(
                Segment(
                    text=text,
                    blank_before=True,
                    kind="table",
                    table_html=str(el),
                    metadata={"from_html": True},
                )
            )
            continue

        for line in _block_lines(el):
            line = normalize_text(line)
            if not line:
                continue
            _append(
                Segment(
                    text=line,
                    blank_before=True,
                    bold=_is_bold(el),
                    metadata={"tag": el.name},
                )
            )

    return segments, "".join(parts)


def segment_content(
    plain_text: Optional[str], sanitized_html: Optional[str]
) -> tuple[list[Segment], str]:
    """Escolhe a melhor fonte: HTML estruturado quando disponivel."""
    if sanitized_html and BeautifulSoup(sanitized_html, "html.parser").find(
        BLOCK_LEVEL_TAGS | {"table"}
    ):
        return segment_html(sanitized_html)
    if plain_text and plain_text.strip():
        return segment_plain_text(plain_text)
    if sanitized_html:
        text = BeautifulSoup(sanitized_html, "html.parser").get_text("\n")
        return segment_plain_text(text)
    return [], ""
