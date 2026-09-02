import re

import bleach
from bleach.css_sanitizer import CSSSanitizer

ALLOWED_TAGS = [
    "p", "br", "div", "span",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "caption", "colgroup", "col",
    "a",
    "strong", "b", "em", "i", "u", "s", "sub", "sup",
    "blockquote", "pre", "code",
    "img", "hr",
    "dl", "dt", "dd",
    "abbr", "cite",
    "del", "ins",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "td": ["colspan", "rowspan", "style"],
    "th": ["colspan", "rowspan", "style"],
    "tr": ["style"],
    "table": ["style", "border", "cellpadding", "cellspacing"],
    "col": ["style", "span"],
    "colgroup": ["span"],
    "*": ["class", "style"],
}

ALLOWED_STYLES = [
    # TipTap / editor presentation properties (safe, no JS/URLs)
    "text-align", "vertical-align", "text-indent", "text-transform",
    "letter-spacing", "white-space", "line-height",
    "width", "height", "max-width", "max-height", "min-height", "object-fit",
    "border", "border-top", "border-right", "border-bottom", "border-left",
    "border-width", "border-style", "border-color", "border-radius",
    "border-collapse", "border-spacing",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "font-weight", "font-style", "font-size", "font-family", "text-decoration",
    "background-color", "color",
    "display", "float", "overflow-wrap", "word-break",
    "page-break-before", "page-break-after", "page-break-inside",
]

# NOTE: "data" is intentionally NOT allowed. Allowing the `data:` scheme on a
# generic URL attribute enables `data:text/html,...` payloads (XSS) and `data:`
# files. Images encoded as data URLs should use the semantic renderer's
# `_safe_url`, which permits only `data:image/*`. See app/semantic/renderer.py.
ALLOWED_PROTOCOLS = ["http", "https", "ftp", "mailto", "file"]


def sanitize_html(html: str) -> str:
    if not html:
        return ""
    cleaned = _strip_dangerous_elements(html)
    css_sanitizer = CSSSanitizer(allowed_css_properties=ALLOWED_STYLES)
    cleaned = bleach.clean(
        cleaned,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
        css_sanitizer=css_sanitizer,
    )
    return cleaned


def _strip_dangerous_elements(html: str) -> str:
    stripped = re.sub(
        r'<(script|style|iframe|object|embed)[^>]*>.*?</\1>',
        "",
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    stripped = re.sub(
        r'<(script|style|iframe|object|embed)[^>]*/>',
        "",
        stripped,
        flags=re.IGNORECASE,
    )
    return stripped


def extract_plain_text(html: str) -> str:
    if not html:
        return ""
    text = re.sub(
        r'<(script|style|iframe)[^>]*>.*?</\1>',
        "",
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    text = re.sub(
        r'</?(?:p|div|h[1-6]|li|tr|br|blockquote|section)[^>]*>',
        "\n",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r'</?(?:td|th|caption)[^>]*>', " ", text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', "", text)
    import html as html_mod
    text = html_mod.unescape(text)
    text = re.sub(r'[ \t]+\n', "\n", text)
    text = re.sub(r'\n{3,}', "\n\n", text)
    text = re.sub(r'&nbsp;', " ", text)
    return text.strip()
