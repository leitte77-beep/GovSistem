"""Import Word paragraph/run styles without asking a language model to redraw them.

Replacements are matched on paragraph text, so markers can cross Word runs.
The replacement inherits the first matched run's appearance.

Avisos de licitação/dispensa são publicados como um quadro: no .docx o ato
inteiro é uma tabela, e o corpo precisa ser percorrido na ordem real
(parágrafos e tabelas intercalados) para que nada se perca nem troque de lugar.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.document_model.schemas import DocumentModelConfig


def inherited(obj, attribute, paragraph, font=False):
    value = getattr(obj, attribute, None)
    if value is not None:
        return value
    style = paragraph.style
    while style is not None:
        value = getattr(style.font if font else style.paragraph_format, attribute, None)
        if value is not None:
            return value
        style = style.base_style
    return None


def _body_items(parent, doc):
    """Parágrafos e tabelas do corpo, na ordem em que aparecem no documento."""
    for child in parent.element.body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, parent)
        elif child.tag.endswith("}tbl"):
            yield Table(child, doc)


def _markers_for(text: str, replacements: dict[str, str]):
    """Posições a substituir no parágrafo, resolvendo sobreposições.

    Um valor do documento costuma aparecer contido em outro — "7.000,00" está
    dentro de "R$ 7.000,00 (Sete Mil Reais)". Vence a correspondência mais
    longa (a mais específica), e as contidas nela são descartadas; assim o
    catálogo pode declarar as duas formas sem que uma estrague a outra.
    """
    found = []
    for old, marker in replacements.items():
        found.extend((m.start(), m.end(), marker) for m in re.finditer(re.escape(old), text))
    # Mais longa primeiro em cada início; empate resolvido pela ordem do texto.
    found.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    matches: list[tuple[int, int, str]] = []
    for start, end, marker in found:
        if matches and start < matches[-1][1]:
            if end <= matches[-1][1]:
                continue  # contida na anterior: descartada
            raise ValueError(
                f"Trechos a substituir se cruzam em {marker!r}: "
                f"{text[start:end]!r} invade o anterior {text[matches[-1][0]:matches[-1][1]]!r}"
            )
        matches.append((start, end, marker))
    return matches


def _runs_html(paragraph, replacements: dict[str, str], prefix: str = "") -> str:
    text = paragraph.text
    matches = _markers_for(text, replacements)
    parts = [html.escape(prefix)]
    offset = 0
    for run in paragraph.runs:
        start, end = offset, offset + len(run.text)
        offset = end
        pieces = []
        pos = start
        for lo, hi, marker in matches:
            if hi <= start or lo >= end:
                continue
            pieces.append(text[pos:max(pos, lo)])
            if start <= lo < end:
                pieces.append("{{" + marker + "}}")
            pos = max(pos, min(end, hi))
        pieces.append(text[pos:end])
        value = html.escape("".join(pieces)).replace("\n", "<br>").replace("\t", "&#160;&#160;&#160;&#160;")
        if not value:
            continue
        font = run.font
        name = inherited(font, "name", paragraph, True) or "Times New Roman"
        size = inherited(font, "size", paragraph, True)
        size = size.pt if size is not None else 12
        if inherited(font, "bold", paragraph, True):
            value = f"<strong>{value}</strong>"
        if inherited(font, "italic", paragraph, True):
            value = f"<em>{value}</em>"
        if inherited(font, "underline", paragraph, True):
            value = f"<u>{value}</u>"
        parts.append(f'<span style="font-family:{html.escape(name, quote=True)};font-size:{size:g}pt">{value}</span>')
    return "".join(parts)


def _paragraph_css(paragraph) -> str:
    fmt = paragraph.paragraph_format
    css = []
    alignment = inherited(fmt, "alignment", paragraph)
    css.append("text-align:" + {0: "left", 1: "center", 2: "right", 3: "justify"}.get(alignment, "left"))
    for attr, prop in [("space_before", "margin-top"), ("space_after", "margin-bottom"),
                       ("left_indent", "margin-left"), ("right_indent", "margin-right"),
                       ("first_line_indent", "text-indent")]:
        value = inherited(fmt, attr, paragraph)
        css.append(f"{prop}:{value.pt if value is not None else 0:g}pt")
    spacing = inherited(fmt, "line_spacing", paragraph)
    if spacing is not None:
        css.append(f"line-height:{spacing.pt:g}pt" if hasattr(spacing, "pt") else f"line-height:{spacing:g}")
    return ";".join(css)


def paragraph_html(paragraph, replacements: dict[str, str], prefix: str = "") -> str:
    content = _runs_html(paragraph, replacements, prefix)
    if not paragraph.text.strip() and not prefix:
        content = '<span style="font-family:Times New Roman;font-size:12pt">&#160;</span>'
    return f'<p style="{_paragraph_css(paragraph)}">{content}</p>'


_CELL_PADDING = "padding:4pt"
# Quando o .docx não declara borda alguma, mantemos a grade fina de sempre —
# é o que o Word desenha por padrão e o que o leitor espera de um quadro.
_DEFAULT_BORDER = "border:0.75pt solid #000"
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_VALIGN = {"top": "top", "center": "middle", "bottom": "bottom"}
_SIDES = ("top", "right", "bottom", "left")
# w:val que significam "sem linha"; os demais são traçados de algum tipo.
_NO_BORDER = {"nil", "none"}


def _border_css(element) -> str:
    """Uma borda do Word como CSS. ``w:sz`` vem em oitavos de ponto."""
    val = (element.get(f"{_W}val") or "").strip().lower()
    if val in _NO_BORDER:
        return "none"
    try:
        width = max(float(element.get(f"{_W}sz") or 4) / 8.0, 0.25)
    except (TypeError, ValueError):
        width = 0.5
    color = (element.get(f"{_W}color") or "auto").strip()
    color = "#000" if color.lower() in ("auto", "") else f"#{color}"
    style = "double" if val == "double" else "dashed" if "dash" in val else "solid"
    return f"{width:g}pt {style} {color}"


def _cell_borders(tc) -> str:
    """Bordas declaradas na célula, lado a lado.

    O quadro do termo de homologação tem apenas as linhas horizontais
    (``w:left``/``w:right`` = ``nil``). Desenhar a grade completa, como fazíamos,
    muda a cara do documento que a prefeitura assina.
    """
    borders = tc.find(f"{_W}tcPr/{_W}tcBorders")
    if borders is None:
        return _DEFAULT_BORDER
    declared = []
    for side in _SIDES:
        element = borders.find(f"{_W}{side}")
        if element is not None:
            declared.append(f"border-{side}:{_border_css(element)}")
    return ";".join(declared) if declared else _DEFAULT_BORDER


def _cell_width(tc) -> str:
    """Largura declarada na célula (``w:tcW``).

    O ``<colgroup>`` sozinho não basta: o editor reconstrói o grupo de colunas
    e a largura se perderia. Na célula ela sobrevive à ida e volta — e é o que
    mantém a coluna do "Item" estreita e a da "Descrição" larga.
    """
    element = tc.find(f"{_W}tcPr/{_W}tcW")
    if element is None:
        return ""
    try:
        value = float(element.get(f"{_W}w") or 0)
    except (TypeError, ValueError):
        return ""
    if value <= 0:
        return ""
    kind = (element.get(f"{_W}type") or "dxa").lower()
    if kind == "pct":  # OOXML: 5000 = 100%
        return f";width:{value / 50:.4g}%"
    if kind == "dxa":  # twips
        return f";width:{value / 20:.4g}pt"
    return ""


def _cell_shading(tc) -> str:
    """Cor de fundo da célula (``w:shd``).

    As faixas de seção do aviso são coloridas no Word; a cor separa visualmente
    os grupos de informação e o leitor do Diário reconhece o quadro por ela.
    """
    for shd in tc.iterfind(f"{_W}tcPr/{_W}shd"):
        fill = (shd.get(f"{_W}fill") or "").strip()
        if fill and fill.lower() not in ("auto", "ffffff"):
            return f";background-color:#{fill}"
    return ""


def _cell_valign(tc) -> str:
    for valign in tc.iterfind(f"{_W}tcPr/{_W}vAlign"):
        return f";vertical-align:{_VALIGN.get(valign.get(f'{_W}val'), 'top')}"
    return ";vertical-align:top"


def _colgroup(table) -> str:
    """Larguras das colunas do Word, em porcentagem da tabela.

    Sem elas o navegador redistribui tudo pelo conteúdo: a coluna do "☑" fica
    larga e o quadro deixa de parecer o documento assinado.
    """
    grid = table._tbl.find(f"{_W}tblGrid")
    if grid is None:
        return ""
    widths = []
    for col in grid.iterfind(f"{_W}gridCol"):
        try:
            widths.append(float(col.get(f"{_W}w") or 0))
        except (TypeError, ValueError):
            widths.append(0.0)
    total = sum(widths)
    if not total:
        return ""
    cols = "".join(f'<col style="width:{w / total * 100:.4g}%"/>' for w in widths)
    return f"<colgroup>{cols}</colgroup>"


def table_html(table, replacements: dict[str, str]) -> str:
    """Quadro do Word como <table>, preservando a forma do documento.

    Mesclagens horizontais viram ``colspan``: sem isso as faixas de título do
    aviso ("DADOS GERAIS DO PROCESSO") seriam repetidas em cada coluna — é
    assim que o python-docx devolve uma célula mesclada. Larguras, fundos e
    alinhamento vertical vêm do próprio .docx.
    """
    rows = []
    for row in table.rows:
        cells = []
        seen = set()
        for cell in row.cells:
            if cell._tc in seen:
                continue
            seen.add(cell._tc)
            span = getattr(cell._tc, "grid_span", 1) or 1
            inner = "".join(paragraph_html(p, replacements) for p in cell.paragraphs)
            style = (_cell_borders(cell._tc) + ";" + _CELL_PADDING
                     + _cell_valign(cell._tc) + _cell_shading(cell._tc)
                     + _cell_width(cell._tc))
            attrs = f' colspan="{span}"' if span > 1 else ""
            cells.append(f'<td style="{style}"{attrs}>{inner}</td>')
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return (
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed">'
        + _colgroup(table)
        + "".join(rows)
        + "</table>"
    )


# Assinatura do formato OLE2, usado pelo Word 97-2003 (.doc).
_OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def _reject_legacy_doc(path: Path) -> None:
    """Recusa .doc (Word 97-2003) com uma mensagem que diz o que fazer.

    O leitor só entende .docx (OOXML). Sem esta checagem o erro seria um
    ``PackageNotFoundError`` genérico, que parece arquivo corrompido e manda
    quem importa procurar no lugar errado.
    """
    try:
        with open(path, "rb") as handle:
            head = handle.read(8)
    except OSError:
        return
    if head == _OLE2_MAGIC:
        raise ValueError(
            f"{path.name} está no formato antigo do Word (.doc). Abra o arquivo "
            "no Word e use 'Salvar como' → 'Documento do Word (*.docx)'; a "
            "importação preserva a formatação apenas do .docx."
        )


def convert(
    path: Path,
    replacements: dict[str, str],
    purpose: str,
    *,
    document_type: str = "portaria",
    document_title: str = "PORTARIA",
) -> DocumentModelConfig:
    _reject_legacy_doc(path)
    doc = Document(path)
    sections = []
    serial = 0
    for index, item in enumerate(_body_items(doc, doc)):
        if isinstance(item, Table):
            block = table_html(item, replacements)
        else:
            # Word numbering is separate from paragraph text.
            prefix = ""
            if item._p.xpath("./w:pPr/w:numPr"):
                serial += 1
                from app.document_model.body_html import roman
                prefix = roman(serial) + " "
            block = paragraph_html(item, replacements, prefix)
        sections.append(dict(id=f"word_{index}", kind="paragraph", text="",
                             template_html=block, fixed_text=True, locked=True))
    # O título também pode trazer marcadores ("PORTARIA Nº {{numero}}/{{ano}}")
    # e todo marcador precisa de um campo declarado.
    marker_source = "".join(s["template_html"] for s in sections) + document_title
    markers = sorted(set(re.findall(r"\{\{([a-z0-9_]+)\}\}", marker_source)))
    return DocumentModelConfig(
        purpose=purpose, scope_document_type=document_type, document_title=document_title,
        description=f"Importação visual de {path.name}. Estilos e textos fixos preservados do Word.",
        fields=[dict(key=k, label=k.replace("_", " ").title(), required=True, type="text",
                     help="Use data por extenso quando o campo indicar extenso. Não copie dados pessoais do exemplo.") for k in markers],
        sections=sections,
    )
