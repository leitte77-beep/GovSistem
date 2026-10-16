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
  normalizeWhitespaceArtifacts(body, doc);

  // Normalize tables so ProseMirror/TipTap parse them cleanly.
  let preservedTables = false;
  if (/<table[\s>]/i.test(body.innerHTML)) {
    preservedTables = normalizeTables(body, doc);
  }

  // Rebuild from the sanitized body.
  return { html: body.innerHTML, warnings, preservedTables };
}

const BLOCK_TAGS = new Set(["p", "div", "section", "li", "blockquote", "td", "th"]);

/**
 * Normalize paste artifacts that would otherwise leak into the legal document:
 * - non-breaking spaces (`&nbsp;`) become ordinary spaces so text reflows and
 *   justified paragraphs behave;
 * - leading/trailing `<br>` inside a block (a Word/Google Docs artifact) are
 *   dropped;
 * - runs of 3+ `<br>` collapse to a single empty line;
 * - empty inline wrappers (`<span>`, `<font>`, `<o:p>`) are removed.
 * No wording, number or meaningful line break is altered.
 */
function normalizeWhitespaceArtifacts(body: Element, doc: Document): void {
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const node of textNodes) {
    const value = node.nodeValue;
    if (value && value.includes("\u00a0")) {
      node.nodeValue = value.replace(/\u00a0/g, " ");
    }
  }

  for (const el of Array.from(body.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    if ((tag === "span" || tag === "font") && !el.textContent?.trim() && !el.querySelector("img, br")) {
      el.remove();
      continue;
    }
    if (!BLOCK_TAGS.has(tag)) continue;

    const children = Array.from(el.childNodes);
    // Strip leading/trailing <br>.
    while (children.length && isBr(children[0])) {
      children.shift()!.remove();
    }
    while (children.length && isBr(children[children.length - 1])) {
      children.pop()!.remove();
    }
    // Collapse runs of 3+ <br> (ignoring whitespace-only text nodes).
    let brRun = 0;
    for (const child of Array.from(el.childNodes)) {
      if (isBr(child)) {
        brRun += 1;
        if (brRun > 2) child.remove();
        continue;
      }
      if (child.nodeType === Node.TEXT_NODE && !(child.nodeValue || "").trim()) {
        continue;
      }
      brRun = 0;
    }
  }
}

function isBr(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === "br";
}

function cleanAttributes(el: Element): void {
  walk(el, el.ownerDocument!);
}

const UNIT_TO_PT: Record<string, number> = { pt: 1, px: 0.75, cm: 28.3465, mm: 2.83465, in: 72, pc: 12 };

/** Comprimento absoluto em pt (`2.0cm`, `453.1pt`, `120px`, ou o atributo `width=76`). */
export function lengthToPt(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\s*([\d.]+)\s*(pt|px|cm|mm|in|pc)?\s*$/i.exec(value);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount * UNIT_TO_PT[(match[2] || "px").toLowerCase()];
}

function declarations(style: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of style.split(";")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const name = part.slice(0, index).trim().toLowerCase();
    const value = part.slice(index + 1).replace(/\s+/g, " ").trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

const CELL_KEPT = new Set([
  "text-align", "vertical-align", "background-color",
  "border", "border-top", "border-right", "border-bottom", "border-left",
]);

/**
 * Estilo da célula colada: só o que é forma do quadro (fundo, bordas por lado,
 * alinhamento). Larguras são recalculadas por coluna em `columnPercentages`.
 * O Word escreve o fundo como `background:` e a cor da borda como `windowtext`,
 * que o motor de PDF não conhece.
 */
function cellStyle(cell: Element): string {
  const source = declarations(cleanStyle(cell.getAttribute("style") || ""));
  const out = new Map<string, string>();
  const background = source.get("background");
  if (background && !/url\(/i.test(background)) {
    const color = background.split(" ").find((part) => /^(#[0-9a-f]{3,8}|rgba?\(.*\)|[a-z]+)$/i.test(part));
    if (color && !/^(none|transparent|auto)$/i.test(color)) out.set("background-color", color);
  }
  for (const [name, value] of source) {
    if (!CELL_KEPT.has(name)) continue;
    out.set(name, value.replace(/windowtext|currentcolor/gi, "#000"));
  }
  const valign = cell.getAttribute("valign");
  if (valign && !out.has("vertical-align")) out.set("vertical-align", valign.toLowerCase());
  const hasBorder = Array.from(out.keys()).some((name) => name.startsWith("border"));
  if (!hasBorder) out.set("border", "1px solid #000");
  out.set("padding", "3pt 5pt");
  return Array.from(out, ([name, value]) => `${name}:${value}`).join(";");
}

function rowCells(row: Element): Element[] {
  return Array.from(row.children).filter((child) => /^(td|th)$/i.test(child.tagName));
}

function span(cell: Element, attr: "colspan" | "rowspan"): number {
  const value = parseInt(cell.getAttribute(attr) || "1", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Larguras das colunas em % (somando 100). Usa a largura declarada pelas
 * células de uma coluna só (o Word declara todas, em pt/cm ou no atributo
 * `width`); coluna sem largura conhecida divide o que sobra. Sem nenhuma
 * largura, devolve null e o PDF calcula pelo conteúdo.
 */
export function columnPercentages(rows: Element[]): { widths: number[]; positions: Map<Element, number> } | null {
  const positions = new Map<Element, number>();
  const occupied: boolean[][] = [];
  const known: (number | null)[] = [];
  let columns = 0;
  rows.forEach((row, r) => {
    occupied[r] = occupied[r] || [];
    let c = 0;
    for (const cell of rowCells(row)) {
      while (occupied[r][c]) c += 1;
      positions.set(cell, c);
      const cs = span(cell, "colspan");
      const rs = span(cell, "rowspan");
      for (let dr = 0; dr < rs; dr += 1) {
        occupied[r + dr] = occupied[r + dr] || [];
        for (let dc = 0; dc < cs; dc += 1) occupied[r + dr][c + dc] = true;
      }
      if (cs === 1 && known[c] == null) {
        const styleWidth = declarations(cell.getAttribute("style") || "").get("width");
        const width = lengthToPt(styleWidth) ?? lengthToPt(cell.getAttribute("width"));
        if (width) known[c] = width;
      }
      c += cs;
      columns = Math.max(columns, c);
    }
  });
  if (!columns) return null;
  const declared = known.slice(0, columns).filter((w): w is number => w != null);
  if (!declared.length) return null;
  const declaredTotal = declared.reduce((a, b) => a + b, 0);
  const missing = columns - declared.length;
  const filler = missing ? declaredTotal / declared.length : 0;
  const raw = Array.from({ length: columns }, (_, i) => known[i] ?? filler);
  const total = raw.reduce((a, b) => a + b, 0);
  const widths = raw.map((w) => Math.round((w / total) * 10000) / 100);
  return { widths, positions };
}

function isEntirelyBold(cell: Element): boolean {
  const text = (cell.textContent || "").replace(/\s+/g, "");
  if (!text) return true;
  const bold = Array.from(cell.querySelectorAll("strong, b"))
    .filter((el) => !el.parentElement?.closest("strong, b"))
    .map((el) => el.textContent || "")
    .join("")
    .replace(/\s+/g, "");
  return bold === text;
}

function normalizeTables(body: Element, doc: Document): boolean {
  let found = false;
  for (const table of Array.from(body.querySelectorAll("table"))) {
    // Tabelas aninhadas são tratadas pela de fora.
    if (table.parentElement?.closest("table")) continue;
    const normalized = doc.createElement("table");
    normalized.setAttribute("style", "width:100%;border-collapse:collapse;");
    const tbody = doc.createElement("tbody");

    const rows = Array.from(table.querySelectorAll("tr")).filter(
      (row) => row.closest("table") === table,
    );
    const layout = columnPercentages(rows);
    // Primeira linha toda em negrito num quadro com dados = cabeçalho; vira
    // <th> para o PDF repeti-la no alto de cada página.
    const promoteHeader = rows.length >= 3
      && rowCells(rows[0]).length > 1
      && rowCells(rows[0]).every((cell) => cell.tagName.toLowerCase() === "th" || isEntirelyBold(cell))
      && rowCells(rows[0]).some((cell) => (cell.textContent || "").trim());

    rows.forEach((row, rowIndex) => {
      const normalizedRow = doc.createElement("tr");
      for (const cell of rowCells(row)) {
        const tag = cell.tagName.toLowerCase();
        const asHeader = tag === "th" || (promoteHeader && rowIndex === 0);
        const normalizedCell = doc.createElement(asHeader ? "th" : "td");
        const colspan = cell.getAttribute("colspan");
        const rowspan = cell.getAttribute("rowspan");
        if (colspan) normalizedCell.setAttribute("colspan", colspan);
        if (rowspan) normalizedCell.setAttribute("rowspan", rowspan);

        let style = cellStyle(cell);
        if (layout) {
          const start = layout.positions.get(cell) ?? 0;
          const width = layout.widths
            .slice(start, start + span(cell, "colspan"))
            .reduce((a, b) => a + b, 0);
          if (width > 0) style += `;width:${Math.round(width * 100) / 100}%`;
        }
        normalizedCell.setAttribute("style", style);

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
    });

    if (tbody.children.length > 0) {
      normalized.appendChild(tbody);
      table.replaceWith(normalized);
      found = true;
    }
  }
  return found;
}

/**
 * True when pasted HTML carries no real formatting signal (bold, italic,
 * underline, heading, table, centered text) — typical of text copied from a
 * PDF viewer (Adobe Acrobat, browser PDF preview), which wraps each line in
 * a plain <span>/<p> with no styling. Treating that as "rich HTML" would
 * skip the PDF-detection dialog and official-act formatter that only run
 * today for text/plain-only pastes.
 */
export function htmlLacksFormatting(html: string): boolean {
  if (!html.trim()) return true;
  const hasFormattingTag = /<(strong|b|em|i|u|mark|table|h[1-6])[\s>]/i.test(html);
  const hasFormattingStyle = /(font-weight\s*:\s*(bold|[6-9]00)|text-align\s*:\s*center|text-decoration\s*:\s*underline)/i.test(html);
  return !hasFormattingTag && !hasFormattingStyle;
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
