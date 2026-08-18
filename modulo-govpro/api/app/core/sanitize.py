"""Sanitização de HTML (defesa em profundidade contra XSS).

Usa `nh3` (port Rust do ammonia) quando disponível; caso contrário, cai para um
fallback que remove todas as tags — seguro, porém sem formatação. O ponto de
aplicação é o conteúdo de modelos/textos padrão devolvido pelos endpoints de
renderização e qualquer HTML exibido em contexto público.
"""

from typing import Optional, Set

_ALLOWED_TAGS: Set[str] = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "del",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote", "pre", "code",
    "table", "thead", "tbody", "tr", "th", "td",
    "a", "span", "div", "hr", "img", "figure", "figcaption",
}

_ALLOWED_ATTRIBUTES = {
    "*": {"class", "title", "style"},
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
}

_ALLOWED_URL_SCHEMES: Set[str] = {"http", "https", "mailto"}


def _strip_tags(html: str) -> str:
    import html as _html
    import re

    cleaned = re.sub(r"(?is)<(script|style|iframe|object|embed|svg|math).*?>.*?</\1>", "", html)
    cleaned = re.sub(r"(?s)<[^>]*>", "", cleaned)
    return _html.unescape(cleaned).strip()


def sanitize_html(html: Optional[str]) -> str:
    if not html:
        return ""
    try:
        import nh3

        return nh3.clean(
            html,
            tags=_ALLOWED_TAGS,
            attributes=_ALLOWED_ATTRIBUTES,
            url_schemes=_ALLOWED_URL_SCHEMES,
        )
    except ImportError:  # pragma: no cover - fallback sem nh3
        return _strip_tags(html)
