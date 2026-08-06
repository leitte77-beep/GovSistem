import DOMPurify from "isomorphic-dompurify";

export interface SanitizeResult {
  clean: string;
  warnings: string[];
}

const DANGEROUS_PATTERNS: [RegExp, string][] = [
  [/<script[\s>]/gi, "tag <script>"],
  [/<iframe[\s>]/gi, "tag <iframe>"],
  [/<object[\s>]/gi, "tag <object>"],
  [/<embed[\s>]/gi, "tag <embed>"],
  [/<style[\s>]/gi, "tag <style>"],
  [/<form[\s>]/gi, "tag <form>"],
  [/<input[\s>]/gi, "tag <input>"],
  [/<base[\s>]/gi, "tag <base>"],
  [/\bon\w+\s*=/gi, "event handler (on*)"],

  [/javascript\s*:/gi, "javascript: URI"],
  [/vbscript\s*:/gi, "vbscript: URI"],
];

export function sanitizeHtml(html: string): SanitizeResult {
  const warnings: string[] = [];

  for (const [pattern, label] of DANGEROUS_PATTERNS) {
    if (pattern.test(html)) {
      warnings.push(`Removed ${label}`);
    }
  }

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "div", "span",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td",
      "caption", "colgroup", "col",
      "a", "strong", "b", "em", "i", "u", "s", "sub", "sup",
      "blockquote", "pre", "code",
      "img", "hr", "dl", "dt", "dd",
      "abbr", "cite", "del", "ins",
    ],
    ALLOWED_ATTR: [
      "href", "target", "title", "rel",
      "src", "alt", "width", "height",
      "colspan", "rowspan", "border",
      "cellpadding", "cellspacing",
      "class", "style",
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
  return { clean, warnings };
}

function cleanMsoStyles(style: string): string {
  return style
    .replace(/mso-[a-z-]+[^;]*;?/gi, "")
    .replace(/;[;\s]+/g, ";")
    .replace(/^\s*;\s*/, "")
    .replace(/;\s*$/, "")
    .trim();
}

function cleanWordAttrs(el: Element): void {
  const remove: string[] = [];

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();

    if (name.startsWith("xmlns") || name.includes(":")) {
      remove.push(attr.name);
      continue;
    }

    if (name === "class" && /mso/i.test(attr.value)) {
      remove.push(attr.name);
      continue;
    }

    if (name === "lang" || name === "xml:lang") {
      remove.push(attr.name);
      continue;
    }

    if (name === "style") {
      const cleaned = cleanMsoStyles(attr.value);
      if (cleaned) {
        el.setAttribute("style", cleaned);
      } else {
        remove.push(attr.name);
      }
    }
  }

  for (const name of remove) {
    el.removeAttribute(name);
  }
}

function cleanWordNode(el: Element): void {
  const toRemove: ChildNode[] = [];

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) {
      toRemove.push(child);
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tagName = (child as Element).tagName.toLowerCase();

    // Remove <style>, <script>, Office namespace elements (o:p, w:*, v:*, etc.)
    if (["style", "script", "o:p", "xml"].includes(tagName) || tagName.includes(":")) {
      toRemove.push(child);
      continue;
    }

    cleanWordAttrs(child as Element);
    cleanWordNode(child as Element);
  }

  for (const node of toRemove) {
    node.parentNode?.removeChild(node);
  }
}

export function stripWordMso(html: string): string {
  if (typeof window === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;

  if (!body || !body.childNodes.length) return html;

  cleanWordNode(body);

  return body.innerHTML;
}
