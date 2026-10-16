"""Diagramação automática das tabelas do corpo da matéria para o PDF.

As tabelas chegam de várias origens — colagem do Word/Excel/portal de compras,
modelo documental, IA — com larguras ausentes, em unidades absolutas ou somando
mais de 100% (a edição 52/2026 saiu com 110% e a tabela foi cortada à direita).
Com ``table-layout: auto`` o WeasyPrint espreme colunas sem largura até quebrar
palavras letra a letra ("PROCEDIMENT/O").

``prepare_tables_for_print`` deixa cada tabela pronta para a página, sempre do
mesmo jeito para a mesma entrada:

* larguras de coluna em %, somando 100 — as declaradas pelo autor quando todas
  existem; senão calculadas pelo conteúdo, garantindo espaço para a maior
  palavra de cada coluna;
* fonte reduzida em tabelas largas (como o diagramador fazia no Word), só o
  bastante para as colunas caberem;
* linhas de cabeçalho em ``<thead>``, que o PDF repete no alto de cada página;
* ``table-layout: fixed`` com ``<colgroup>``: nenhuma tabela passa da margem.

Nada do texto é alterado — só atributos de apresentação.
"""

from __future__ import annotations

import logging
import math
import re

from lxml import etree
from lxml import html as lxml_html

logger = logging.getLogger(__name__)

# Área útil do layout clássico: A4 (595pt) menos as margens de 1,7cm.
USABLE_WIDTH_PT = 595.3 - 2 * 48.2
# Largura aproximada de cada caractere em fonte serifada (Times/Liberation
# Serif), em "em": maiúsculas são bem mais largas que minúsculas, e o negrito
# alarga mais um pouco. Errar para mais só tira um pouco de espaço da coluna
# vizinha; errar para menos hifeniza rótulos como "PROCEDIMENTO".
UPPER_EM = 0.72
LOWER_EM = 0.50
DIGIT_EM = 0.50
OTHER_EM = 0.40
BOLD_FACTOR = 1.08
CELL_PADDING_PT = 10.0
BASE_FONT_PT = 12.0
# Degraus de fonte tentados para caber; abaixo de 7pt a leitura fica ruim.
FONT_STEPS_PT = (10.0, 9.0, 8.0, 7.5, 7.0)
LONG_WORD_CAP_EM = 13.0  # palavra maior que isto (URL, e-mail) pode quebrar

_UNIT_TO_PT = {"pt": 1.0, "px": 0.75, "cm": 28.3465, "mm": 2.83465, "in": 72.0, "pc": 12.0}
_LENGTH_RE = re.compile(r"^\s*([\d.]+)\s*(%|pt|px|cm|mm|in|pc)?\s*$", re.I)


def _declarations(style: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in (style or "").split(";"):
        name, sep, value = part.partition(":")
        if sep and name.strip() and value.strip():
            out[name.strip().lower()] = " ".join(value.split())
    return out


def _write_style(el, styles: dict[str, str]) -> None:
    text = ";".join(f"{name}:{value}" for name, value in styles.items())
    if text:
        el.set("style", text)
    elif "style" in el.attrib:
        del el.attrib["style"]


def _width(value: str | None) -> tuple[float, str] | None:
    """(valor, "%"|"pt") de uma largura CSS ou do atributo ``width``."""
    if not value:
        return None
    match = _LENGTH_RE.match(value)
    if not match:
        return None
    amount = float(match.group(1))
    if amount <= 0:
        return None
    unit = (match.group(2) or "px").lower()
    if unit == "%":
        return amount, "%"
    return amount * _UNIT_TO_PT[unit], "pt"


def _span(cell, attr: str) -> int:
    try:
        return max(int(cell.get(attr) or 1), 1)
    except ValueError:
        return 1


def _rows(table) -> list:
    """Linhas da própria tabela (não das tabelas aninhadas)."""
    return [row for row in table.iter("tr") if _owner_table(row) is table]


def _owner_table(el):
    parent = el.getparent()
    while parent is not None and parent.tag != "table":
        parent = parent.getparent()
    return parent


def _cells(row) -> list:
    return [child for child in row if child.tag in ("td", "th")]


def _grid(rows: list) -> tuple[dict, int]:
    """Coluna inicial de cada célula, respeitando colspan/rowspan."""
    positions: dict = {}
    occupied: dict[int, set[int]] = {}
    columns = 0
    for r, row in enumerate(rows):
        taken = occupied.setdefault(r, set())
        c = 0
        for cell in _cells(row):
            while c in taken:
                c += 1
            positions[cell] = c
            cs, rs = _span(cell, "colspan"), _span(cell, "rowspan")
            for dr in range(rs):
                occupied.setdefault(r + dr, set()).update(range(c, c + cs))
            c += cs
            columns = max(columns, c)
    return positions, columns


def _cell_text(cell) -> str:
    return " ".join("".join(cell.itertext()).split())


def _declared_widths(table, rows, positions, columns) -> list[float] | None:
    """Larguras do autor em %, quando TODAS as colunas têm uma."""
    cols = [col for col in table.iter("col") if _owner_table(col) is table]
    from_cols: list[tuple[float, str] | None] = []
    for col in cols:
        span = _span(col, "span")
        width = _width(_declarations(col.get("style")).get("width") or col.get("width"))
        from_cols.extend([None if width is None else (width[0] / span, width[1])] * span)
    if len(from_cols) == columns and all(from_cols):
        known = from_cols
    else:
        known = [None] * columns
        for row in rows:
            for cell in _cells(row):
                if _span(cell, "colspan") != 1:
                    continue
                c = positions[cell]
                if known[c] is None:
                    known[c] = _width(_declarations(cell.get("style")).get("width") or cell.get("width"))
    if not all(known):
        return None
    units = {unit for _, unit in known}
    if len(units) != 1:
        return None
    total = sum(value for value, _ in known)
    return [value / total * 100 for value, _ in known]


def _word_em(word: str, bold: bool) -> float:
    width = 0.0
    for ch in word:
        if ch.isupper():
            width += UPPER_EM
        elif ch.isdigit():
            width += DIGIT_EM
        elif ch.isalpha():
            width += LOWER_EM
        else:
            width += OTHER_EM
    return width * (BOLD_FACTOR if bold else 1.0)


def _content_metrics(rows, positions, columns) -> tuple[list[float], list[float]]:
    """Maior palavra (em "em") e tamanho do texto de cada coluna."""
    longest = [1.0] * columns
    lengths: list[list[int]] = [[] for _ in range(columns)]
    for row in rows:
        for cell in _cells(row):
            if _span(cell, "colspan") != 1:
                continue
            text = _cell_text(cell)
            c = positions[cell]
            if text:
                bold = cell.tag == "th" or _entirely_bold(cell)
                widest = max(_word_em(w, bold) for w in text.split())
                longest[c] = max(longest[c], min(widest, LONG_WORD_CAP_EM))
                lengths[c].append(len(text))
    # O maior texto da coluna (limitado): uma única descrição longa já pede
    # espaço, e o peso pela raiz (em `_fit`) impede que ela tome a tabela toda.
    typical = [float(min(max(values), 300)) if values else 1.0 for values in lengths]
    return longest, typical


def _min_pct(longest_word_em: float, font_pt: float) -> float:
    needed = longest_word_em * font_pt + CELL_PADDING_PT
    return needed / USABLE_WIDTH_PT * 100


def _fit(columns: int, longest: list[float], typical: list[float], declared: list[float] | None,
         ) -> tuple[list[float], float | None]:
    """Larguras finais e a fonte (None = a do corpo) para a tabela caber."""
    default_font = None if columns <= 4 else (9.0 if columns <= 6 else 8.0)
    candidates = [default_font] + [f for f in FONT_STEPS_PT if default_font is None or f < default_font]
    for font in candidates:
        size = font or BASE_FONT_PT
        minimums = [_min_pct(word, size) for word in longest]
        if sum(minimums) > 100:
            continue
        if declared and all(d >= m for d, m in zip(declared, minimums)):
            return declared, font
        if declared:
            weights = declared
        else:
            # Raiz do tamanho típico: texto longo ganha mais espaço, sem
            # esmagar as colunas curtas (item, unidade, quantidade).
            weights = [max(math.sqrt(t), 1.0) for t in typical]
        return _distribute(minimums, weights), font
    # Nem a menor fonte cabe a maior palavra de todas as colunas: divide pelo
    # peso e deixa a hifenização resolver.
    weights = declared or [max(math.sqrt(t), 1.0) for t in typical]
    return _distribute([0.0] * columns, weights), FONT_STEPS_PT[-1]


def _distribute(minimums: list[float], weights: list[float]) -> list[float]:
    """Respeita o mínimo de cada coluna e reparte o resto pelos pesos.

    Cada coluna parte do seu mínimo; a sobra vai primeiro para quem está abaixo
    da sua parte ideal (proporcional ao peso), na proporção do que falta, e o
    que ainda restar é repartido pelos pesos.
    """
    total_weight = sum(weights) or 1.0
    ideal = [w / total_weight * 100 for w in weights]
    widths = list(minimums)
    extra = 100 - sum(widths)
    deficits = [max(i - m, 0.0) for i, m in zip(ideal, minimums)]
    missing = sum(deficits)
    if missing > 0:
        share = min(extra, missing)
        widths = [w + share * d / missing for w, d in zip(widths, deficits)]
        extra -= share
    if extra > 1e-9:
        widths = [w + extra * wt / total_weight for w, wt in zip(widths, weights)]
    total = sum(widths)
    return [w / total * 100 for w in widths]


def _entirely_bold(cell) -> bool:
    text = "".join(_cell_text(cell).split())
    if not text:
        return True
    bold = "".join(
        "".join("".join(el.itertext()).split())
        for el in cell.iter("strong", "b")
        if not any(a.tag in ("strong", "b") for a in el.iterancestors())
    )
    return bold == text


def _promote_header(table, rows) -> None:
    """Linhas de cabeçalho no início viram ``<thead>`` (repetido por página)."""
    if any(_owner_table(el) is table for el in table.iter("thead")) or len(rows) < 3:
        return
    header_rows = []
    for row in rows:
        cells = _cells(row)
        if cells and all(cell.tag == "th" for cell in cells):
            header_rows.append(row)
            continue
        break
    if not header_rows:
        first = _cells(rows[0])
        if len(first) > 1 and all(_entirely_bold(c) for c in first) and any(_cell_text(c) for c in first):
            for cell in first:
                cell.tag = "th"
            header_rows = [rows[0]]
        else:
            return
    if len(header_rows) >= len(rows):
        return
    thead = etree.Element("thead")
    first_parent = header_rows[0].getparent()
    index = list(table).index(first_parent) if first_parent is not table else list(table).index(header_rows[0])
    for row in header_rows:
        row.getparent().remove(row)
        thead.append(row)
    table.insert(index, thead)


def _prepare_table(table) -> None:
    rows = _rows(table)
    if not rows:
        return
    positions, columns = _grid(rows)
    if not columns:
        return
    declared = _declared_widths(table, rows, positions, columns)
    longest, typical = _content_metrics(rows, positions, columns)
    widths, font = _fit(columns, longest, typical, declared)

    for col in [c for c in table.iter("colgroup", "col") if _owner_table(c) is table]:
        if col.getparent() is not None:
            col.getparent().remove(col)
    colgroup = etree.Element("colgroup")
    for width in widths:
        etree.SubElement(colgroup, "col", style=f"width:{width:.2f}%")
    table.insert(0, colgroup)

    for row in rows:
        for cell in _cells(row):
            styles = _declarations(cell.get("style"))
            styles.pop("width", None)
            styles.pop("min-width", None)
            _write_style(cell, styles)
            cell.attrib.pop("width", None)

    styles = _declarations(table.get("style"))
    for name in ("width", "min-width", "max-width", "table-layout"):
        styles.pop(name, None)
    styles["width"] = "100%"
    styles["table-layout"] = "fixed"
    if font:
        styles["font-size"] = f"{font:g}pt"
    _write_style(table, styles)
    table.attrib.pop("width", None)
    classes = [c for c in (table.get("class") or "").split() if not c.startswith("doe-print-table")]
    classes.append("doe-print-table")
    if font:
        # A fonte reduzida tem de valer também sobre o tamanho que o Word deixou
        # em cada trecho da célula; o CSS do layout usa esta classe para isso.
        classes.append("doe-print-table--compact")
    table.set("class", " ".join(classes))

    _promote_header(table, rows)


def prepare_tables_for_print(content_html: str) -> str:
    """Devolve o HTML com todas as tabelas diagramadas para a página A4."""
    if not content_html or "<table" not in content_html.lower():
        return content_html
    try:
        root = lxml_html.fragment_fromstring(content_html, create_parent="div")
    except (etree.ParserError, ValueError):
        return content_html
    try:
        for table in list(root.iter("table")):
            _prepare_table(table)
    except Exception:  # noqa: BLE001 - nunca derrubar a edição por diagramação
        logger.warning("Falha ao diagramar tabelas; mantendo o HTML original", exc_info=True)
        return content_html
    inner = (root.text or "") + "".join(
        lxml_html.tostring(child, encoding="unicode") for child in root
    )
    return inner
