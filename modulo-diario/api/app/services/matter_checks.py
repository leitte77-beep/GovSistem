"""Pontos de atenção do conteúdo de uma matéria, para o operador conferir.

O operador cola o texto e o sistema diagrama; o que sobra para ele é conferir
se o texto colado é o certo. Estas verificações apontam o que costuma passar
despercebido — sem bloquear nada, porque só quem tem o processo em mãos sabe
se é erro:

* ``type_mismatch``     título/tipo do ato diferente do que o texto diz ser
                        (edição 50/2026: "PORTARIA – férias" com o corpo de um
                        Aviso de Dispensa);
* ``summary_mismatch``  súmula que não fala do que o texto fala;
* ``number_mismatch``   número do ato no título ≠ número no cabeçalho do texto;
* ``truncated_text``    texto copiado de portal e cortado ("… Ver Mais");
* ``unfilled_field``    campo de modelo não preenchido ({{campo}}, XXX, ____);
* ``pasted_masthead``   cabeçalho de outro diário colado junto (removido na
                        publicação; o aviso é informativo).

Tudo é determinístico (sem IA): mesma entrada, mesmos avisos.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass

LEVEL_WARNING = "warning"
LEVEL_INFO = "info"


@dataclass
class ContentWarning:
    code: str
    level: str
    message: str
    detail: str = ""
    excerpt: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _fold(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "").lower()
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def _clip(value: str, size: int = 120) -> str:
    value = " ".join((value or "").split())
    return value if len(value) <= size else value[: size - 1].rstrip() + "…"


# ── Texto do corpo ───────────────────────────────────────────────────────────

def _lines_and_cells(content_html: str) -> tuple[list[str], list[str]]:
    """Linhas de texto (parágrafos/títulos, na ordem) e textos de células."""
    if not content_html or not content_html.strip():
        return [], []
    from lxml import etree
    from lxml import html as lxml_html

    try:
        root = lxml_html.fragment_fromstring(content_html, create_parent="div")
    except (etree.ParserError, ValueError):
        return [], []
    for br in root.iter("br"):
        br.tail = " " + (br.tail or "")
    cells = [
        " ".join("".join(cell.itertext()).split())
        for cell in root.iter("td", "th")
    ]
    lines: list[str] = []
    for el in root.iter("p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "div"):
        # Só o bloco mais interno: um <div> com <p> dentro não repete o texto.
        if any(child.tag in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol")
               for child in el):
            continue
        piece = " ".join("".join(el.itertext()).split())
        if piece:
            lines.append(piece)
    if not lines:
        text = " ".join("".join(root.itertext()).split())
        if text:
            lines = [text]
    return lines, cells


# ── Natureza do ato ──────────────────────────────────────────────────────────

# (natureza, grupo, padrão no início de uma linha já sem acento e minúscula)
_KIND_PATTERNS: tuple[tuple[str, str, str], ...] = (
    ("lei", "lei", r"lei( complementar| ordinaria| municipal)?\s+n"),
    ("decreto", "decreto", r"decreto(\s+legislativo)?\s+n"),
    ("portaria", "portaria", r"portaria\s+n"),
    ("resolucao", "resolucao", r"resolucao\s+n"),
    ("aviso", "compras", r"aviso\s+de\s+(dispensa|licitacao|inexigibilidade|pregao|chamamento|"
                         r"credenciamento|homologacao|adjudicacao|revogacao|suspensao)"),
    ("extrato", "compras", r"extrato\s+d[oae]"),
    ("termo", "compras", r"termo\s+de\s+(adjudicacao|homologacao|ratificacao|dispensa|"
                         r"inexigibilidade|fomento|colaboracao)"),
    ("ata", "compras", r"ata\s+de\s+registro"),
    ("edital", "edital", r"edital\s+(de|n)"),
)

# Natureza declarada pelo tipo/título (mais tolerante: o título costuma ser só
# o nome do ato, sem número).
_DECLARED_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"^lei\b|lei complementar", "lei"),
    (r"^decreto", "decreto"),
    (r"^portaria", "portaria"),
    (r"^resolu", "resolucao"),
    (r"^edital", "edital"),
    (r"licita|preg[aã]o|dispensa|inexig|contrat|aditivo|\bata\b|registro de pre|homolog|"
     r"adjudic|extrato|aviso|chamamento|credenc|processos? de compra|compra|termo de", "compras"),
)

_GROUP_LABEL = {
    "lei": "uma Lei", "decreto": "um Decreto", "portaria": "uma Portaria",
    "resolucao": "uma Resolução", "edital": "um Edital",
    "compras": "um ato de compras/licitação (aviso, extrato, termo, ata)",
}


def _group_of(value: str) -> str | None:
    candidate = _fold(value).strip()
    if not candidate or candidate in ("outros", "outro"):
        return None
    for pattern, group in _DECLARED_PATTERNS:
        if re.search(pattern, candidate):
            return group
    return None


def _body_kind(lines: list[str]) -> tuple[str, str, str] | None:
    """Natureza que o texto anuncia nas primeiras linhas: (natureza, grupo, linha)."""
    from app.semantic.parser import _is_masthead

    seen = 0
    for line in lines:
        if _is_masthead(line):
            continue
        seen += 1
        folded = _fold(line)
        for kind, group, pattern in _KIND_PATTERNS:
            if re.match(pattern, folded):
                return kind, group, line
        if seen >= 4:
            break
    return None


# ── Súmula × texto ───────────────────────────────────────────────────────────

_STOPWORDS = {
    "sobre", "para", "pelo", "pela", "pelos", "pelas", "como", "entre", "outras",
    "outros", "providencias", "dispoe", "municipio", "municipal", "farol", "estado",
    "parana", "artigo", "termos", "seguinte", "seguintes", "conforme", "desta", "deste",
    "dessa", "desse", "nesta", "neste", "esta", "este", "essa", "esse", "aquele",
    "quais", "qual", "quando", "onde", "ainda", "tambem", "mesmo", "mesma", "cada",
    "todos", "todas", "demais", "acordo", "forma", "fins", "ate", "apos", "sumula",
    "ementa", "publico", "publica", "oficial", "prefeito", "prefeitura", "servico",
    "servicos", "data", "dias", "valor", "processo", "numero",
}


def _significant_words(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", _fold(text))
    out: list[str] = []
    for word in words:
        if len(word) < 4 or word.isdigit() or word in _STOPWORDS:
            continue
        if word not in out:
            out.append(word)
    return out


def _stem(word: str) -> str:
    """Raiz grosseira: 'ferias'/'feria', 'concede'/'concedendo' casam."""
    return word[:5]


# ── Verificações ─────────────────────────────────────────────────────────────

_TRUNCATION_RE = re.compile(r"\b(ver|leia|mostrar|exibir|saiba)\s+mais\b", re.I)
_TRAILING_ELLIPSIS_RE = re.compile(r"[A-Za-zÀ-ÿ0-9,;]\s*(\.\.\.|…)\s*$")
_PLACEHOLDER_RES: tuple[tuple[re.Pattern, str], ...] = (
    (re.compile(r"\{\{\s*[\w.]+\s*\}\}"), "marcador de modelo"),
    (re.compile(r"\bX{3,}\b"), "XXX"),
    (re.compile(r"_{4,}"), "linha em branco ____"),
    (re.compile(r"\[\s*(inserir|preencher|nome|data|n[uú]mero|valor)[^\]]{0,30}\]", re.I),
     "texto entre colchetes"),
)
_NUMBER_IN_HEADER_RE = re.compile(
    r"^(lei(?: complementar)?|decreto|portaria|resolucao)\s+n\S*\s*([\d.]+)\s*(?:[/-]\s*(\d{2,4}))?"
)


def check_matter_content(
    *,
    title: str = "",
    summary: str = "",
    act_type_name: str = "",
    act_number: str | None = None,
    content_html: str = "",
) -> list[dict]:
    """Avisos para o operador, do mais grave para o mais leve."""
    warnings: list[ContentWarning] = []
    lines, cells = _lines_and_cells(content_html)
    body_text = " ".join(lines)

    # 1. Natureza do ato
    body = _body_kind(lines)
    if body:
        conflicts = []
        type_group = _group_of(act_type_name)
        title_group = _group_of(title)
        if type_group and type_group != body[1]:
            conflicts.append(f"o tipo do ato selecionado (“{act_type_name}”)")
        if title_group and title_group != body[1]:
            conflicts.append(f"o título (“{_clip(title, 60)}”)")
        if conflicts:
            warnings.append(ContentWarning(
                code="type_mismatch",
                level=LEVEL_WARNING,
                message=(
                    f"O texto colado começa como {_GROUP_LABEL.get(body[1], body[1])}, "
                    f"mas {' e '.join(conflicts)} "
                    f"{'indicam' if len(conflicts) > 1 else 'indica'} outra coisa."
                ),
                detail="Confira se o texto colado é desta matéria ou corrija o tipo/título.",
                excerpt=_clip(body[2]),
            ))

    # 2. Número do ato
    if body:
        match = _NUMBER_IN_HEADER_RE.match(_fold(body[2]))
        declared_number = (act_number or "").strip()
        if not declared_number:
            title_number = re.search(r"n\S*\s*(\d[\d.]*)", _fold(title))
            declared_number = title_number.group(1) if title_number else ""
        if match and declared_number:
            body_number = match.group(2).replace(".", "").lstrip("0")
            if body_number and body_number != declared_number.replace(".", "").lstrip("0"):
                warnings.append(ContentWarning(
                    code="number_mismatch",
                    level=LEVEL_WARNING,
                    message=(
                        f"O texto traz o número {match.group(2)}, diferente do número "
                        f"do ato ({declared_number})."
                    ),
                    detail="Na publicação vale o número do ato; confira qual está certo.",
                    excerpt=_clip(body[2]),
                ))

    # 3. Súmula × texto
    summary_words = _significant_words(summary)
    if len(summary_words) >= 2 and body_text:
        body_stems = {_stem(w) for w in _significant_words(body_text)}
        missing = [w for w in summary_words if _stem(w) not in body_stems]
        found = len(summary_words) - len(missing)
        if found / len(summary_words) < 0.34:
            warnings.append(ContentWarning(
                code="summary_mismatch",
                level=LEVEL_WARNING,
                message="A súmula não parece tratar do mesmo assunto do texto.",
                detail="Palavras da súmula que não aparecem no texto: "
                       + ", ".join(missing[:8]) + ".",
                excerpt=_clip(summary),
            ))

    # 4. Texto cortado (cópia de portal de compras, tabela truncada)
    truncated: list[str] = []
    for line in lines:
        if _TRUNCATION_RE.search(line):
            truncated.append(line)
    for cell in cells:
        if _TRAILING_ELLIPSIS_RE.search(cell) and cell not in truncated:
            truncated.append(cell)
    truncated = [t for t in truncated if not re.search(r"\(\s*(\.\.\.|…)\s*\)", t)]
    if truncated:
        warnings.append(ContentWarning(
            code="truncated_text",
            level=LEVEL_WARNING,
            message=(
                f"{len(truncated)} trecho(s) parecem cortados "
                "(\"Ver mais\" ou reticências no fim)."
            ),
            detail="Texto copiado de portal costuma vir resumido: copie a descrição completa.",
            excerpt=_clip(truncated[0]),
        ))

    # 5. Campos não preenchidos
    plain = body_text + " " + " ".join(cells)
    for pattern, label in _PLACEHOLDER_RES:
        found_placeholder = pattern.search(plain)
        if found_placeholder:
            start = max(found_placeholder.start() - 40, 0)
            warnings.append(ContentWarning(
                code="unfilled_field",
                level=LEVEL_WARNING,
                message=f"Há campo não preenchido no texto ({label}).",
                excerpt=_clip(plain[start:found_placeholder.end() + 40]),
            ))
            break

    # 6. Cabeçalho de outro diário colado (removido sozinho na publicação)
    from app.semantic.parser import _is_masthead

    masthead = next((line for line in lines[:6] if _is_masthead(line)), None)
    if masthead:
        warnings.append(ContentWarning(
            code="pasted_masthead",
            level=LEVEL_INFO,
            message="O cabeçalho de um diário foi colado junto com o texto.",
            detail="Ele é retirado automaticamente na publicação; não precisa apagar.",
            excerpt=_clip(masthead),
        ))

    return [w.to_dict() for w in warnings]
