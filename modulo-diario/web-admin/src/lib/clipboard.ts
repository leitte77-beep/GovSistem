/**
 * Clipboard helpers for the official-diary editor.
 *
 * - cleanPastedHtml: normalizes pasted HTML (Word/Excel/web) preserving real
 *   table structure (headers, rowspan/colspan, widths, borders, alignment)
 *   while stripping Office/namespace/dangerous artifacts.
 * - detectPdfExtractedText: heuristics that flag text copied from a PDF so we
 *   never silently fabricate structure that was not actually received.
 */

export interface PastedHtml {
  html: string;
  warnings: string[];
  preservedTables: boolean;
}

const DANGEROUS_TAGS = ["script", "style", "iframe", "object", "embed", "link", "meta", "base", "form", "input", "button"];

const DANGEROUS_PATTERNS: [RegExp, string][] = [
  [/<script[\s>]/gi, "tag <script>"],
  [/<iframe[\s>]/gi, "tag <iframe>"],
  [/<object[\s>]/gi, "tag <object>"],
  [/<embed[\s>]/gi, "tag <embed>"],
  [/<style[\s>]/gi, "tag <style>"],
  [/<link[\s>]/gi, "tag <link>"],
  [/\bon\w+\s*=/gi, "atributo de evento (on*)"],
  [/javascript\s*:/gi, "URI javascript:"],
  [/vbscript\s*:/gi, "URI vbscript:"],
];

/** Deterministic (regex-based) warnings, robust across DOM implementations. */
function detectWarnings(html: string): string[] {
  const out: string[] = [];
  for (const [re, label] of DANGEROUS_PATTERNS) {
    if (re.test(html)) out.push(`Removido: ${label}`);
  }
  return out;
}

function isDangerousTag(tag: string): boolean {
  return DANGEROUS_TAGS.includes(tag.toLowerCase()) || tag.includes(":");
}

function cleanStyle(style: string): string {
  return (style || "")
    .replace(/mso-[a-z-]+[^;]*;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "")
    .replace(/behaviour\s*:[^;]*;?/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/vbscript\s*:/gi, "")
    .replace(/;[;\s]+/g, ";")
    .replace(/^\s*;\s*/, "")
    .replace(/;\s*$/, "")
    .trim();
}

function walk(el: Element, doc: Document): void {
  // Strip dangerous attributes (event handlers, dangerous URIs, namespaces)
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") && name.length > 2) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name.startsWith("xmlns") || name.includes(":")) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === "class" && /mso/i.test(attr.value)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === "lang" || name === "xml:lang") {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === "style") {
      const cleaned = cleanStyle(attr.value);
      if (cleaned) el.setAttribute("style", cleaned);
      else el.removeAttribute(attr.name);
      continue;
    }
    if (name === "href" && /^(javascript|vbscript):/i.test(attr.value.trim())) {
      el.removeAttribute(attr.name);
    }
  }
}

export function cleanPastedHtml(html: string): PastedHtml {
  const warnings: string[] = detectWarnings(html);
  if (typeof window === "undefined") {
    return { html, warnings, preservedTables: false };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return { html, warnings, preservedTables: false };

  const walkTree = (node: Element) => {
    // Collect children first so removal during iteration is safe.
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) {
        node.removeChild(child);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      if (isDangerousTag(el.tagName)) {
        node.removeChild(el);
        warnings.push(`Tag removida: ${el.tagName.toLowerCase()}`);
        continue;
      }
      walkTree(el);
    }
    cleanAttributes(node);
  };

  walkTree(body);

  // Normalize tables so ProseMirror/TipTap parse them cleanly.
  let preservedTables = false;
  if (/<table[\s>]/i.test(body.innerHTML)) {
    preservedTables = normalizeTables(body, doc);
  }

  // Rebuild from the sanitized body.
  return { html: body.innerHTML, warnings, preservedTables };
}

function cleanAttributes(el: Element): void {
  walk(el, el.ownerDocument!);
}

function normalizeTables(body: Element, doc: Document): boolean {
  let found = false;
  for (const table of Array.from(body.querySelectorAll("table"))) {
    const normalized = doc.createElement("table");
    normalized.setAttribute("style", "width:100%;border-collapse:collapse;border:1px solid #000;");
    const tbody = doc.createElement("tbody");

    for (const row of Array.from(table.querySelectorAll("tr"))) {
      const normalizedRow = doc.createElement("tr");
      const cells = Array.from(row.children).filter((child) => {
        const t = child.tagName.toLowerCase();
        return t === "td" || t === "th";
      });

      for (const cell of cells) {
        const tag = cell.tagName.toLowerCase();
        const normalizedCell = doc.createElement(tag === "th" ? "th" : "td");
        const colspan = cell.getAttribute("colspan");
        const rowspan = cell.getAttribute("rowspan");
        const cellStyle = cell.getAttribute("style");
        if (colspan) normalizedCell.setAttribute("colspan", colspan);
        if (rowspan) normalizedCell.setAttribute("rowspan", rowspan);

        const styleParts: string[] = [];
        if (cellStyle && /(?:text-align|vertical-align|background-color|width)/i.test(cellStyle)) {
          styleParts.push(cleanStyle(cellStyle));
        }
        styleParts.push("border:1px solid #000;padding:4px 6px;");
        normalizedCell.setAttribute("style", styleParts.filter(Boolean).join(";"));

        // Keep cell content as a paragraph so TipTap parses it into a node.
        let content = cell.innerHTML.trim();
        if (!content) content = "<br>";
        if (!/^<p[\s>]/i.test(content) && !/^<br\s*\/?>/i.test(content)) {
          content = `<p>${content}</p>`;
        }
        normalizedCell.innerHTML = content;
        normalizedRow.appendChild(normalizedCell);
      }

      if (normalizedRow.children.length > 0) {
        tbody.appendChild(normalizedRow);
      }
    }

    if (tbody.children.length > 0) {
      normalized.appendChild(tbody);
      table.replaceWith(normalized);
      found = true;
    }
  }
  return found;
}

/**
 * Heuristics for text extracted from a PDF (plain text only, no HTML):
 * - line breaks after almost every line;
 * - repeated headers/footers;
 * - columns separated only by spaces;
 * - tabular-looking sequences.
 */
export function detectPdfExtractedText(text: string): { likely: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n").map((l) => l.trim());

  // Almost every line ends a block (short, non-empty lines with no blank separation).
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length >= 6) {
    const shortLines = nonEmpty.filter((l) => l.length > 0 && l.length <= 90);
    const breaksEveryLine = nonEmpty.every((l, i) => i === 0 || true);
    const blankCount = (normalized.match(/\n\s*\n/g) || []).length;
    if (shortLines.length === nonEmpty.length && blankCount < Math.max(2, nonEmpty.length * 0.15)) {
      reasons.push("Quebras de linha após quase todas as linhas");
    }
  }

  // Repeated identical header/footer (>=3 identical short lines).
  const counts = new Map<string, number>();
  for (const l of nonEmpty.slice(0, 40)) {
    if (l.length <= 60) counts.set(l, (counts.get(l) || 0) + 1);
  }
  for (const [l, c] of counts) {
    if (c >= 3 && /^(página|folha|prefeitura|estado|município|governo)/i.test(l)) {
      reasons.push(`Cabeçalho/rodapé repetido: "${l.slice(0, 40)}"`);
    }
  }

  // Columns separated by multiple spaces.
  if (nonEmpty.some((l) => /\S\s{3,}\S/.test(l))) {
    reasons.push("Possíveis colunas separadas por espaços");
  }

  return { likely: reasons.length > 0, reasons };
}
