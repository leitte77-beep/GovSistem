"""Sanitizacao de HTML e normalizacao segura de texto.

Regra de integridade: a normalizacao nunca altera palavras, numeros, datas,
valores ou pontuacao. Apenas remove caracteres invisiveis e uniformiza
quebras de linha/espacos de layout.
"""

import re

import bleach

ALLOWED_TAGS = [
    "p", "br", "div", "span",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "caption", "colgroup", "col",
    "a", "strong", "b", "em", "i", "u", "s", "sub", "sup",
    "blockquote", "pre", "code",
    "hr", "dl", "dt", "dd",
    "abbr", "cite", "del", "ins",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan"],
    "table": ["class"],
    "*": [],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

# Caracteres invisiveis que o Word costuma inserir e que nao carregam conteudo.
_INVISIBLE_RE = re.compile("[\u200b\u200c\u200d\u200e\u200f\ufeff\u00ad\u2060]")
_NBSP_RE = re.compile("[\u00a0\u2007\u202f]")


def sanitize_html(html: str) -> str:
    """Remove scripts, eventos, estilos e tags inseguras preservando estrutura."""
    if not html:
        return ""
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
    )


def normalize_text(text: str) -> str:
    """Normaliza texto para analise sem alterar o conteudo semantico."""
    if not text:
        return ""
    value = text.replace("\r\n", "\n").replace("\r", "\n")
    value = _INVISIBLE_RE.sub("", value)
    value = _NBSP_RE.sub(" ", value)
    # Remove apenas espacos ao final de cada linha (layout).
    value = "\n".join(line.rstrip() for line in value.split("\n"))
    return value.strip("\n")


def collapse_spaces(text: str) -> str:
    """Colapsa espacos internos (uso em comparacoes, nunca no texto guardado)."""
    return re.sub(r"\s+", " ", text).strip()
