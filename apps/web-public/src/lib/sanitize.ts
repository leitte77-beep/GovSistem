import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "div", "span",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "caption", "colgroup", "col",
  "a", "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "blockquote", "pre", "code",
  "img", "hr", "dl", "dt", "dd",
  "abbr", "cite", "del", "ins",
];

const ALLOWED_ATTR = [
  "href", "target", "title", "rel",
  "src", "alt", "width", "height",
  "colspan", "rowspan", "border",
  "cellpadding", "cellspacing",
  "class", "style",
];

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}
