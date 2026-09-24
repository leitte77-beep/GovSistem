/**
 * Deterministic "Format as official act" formatter.
 *
 * Turns plain/lightly-formatted text into structured official-act HTML WITHOUT
 * altering any word or number. Recognizes: preamble, CONSIDERANDO clauses,
 * DECRETA/RESOLVE/SANCIONA verbs, articles, paragraphs, incisos, tabular
 * blocks, place/date, authority name and office.
 *
 * It never invents content and only re-wraps existing lines, so every
 * original character is preserved (undo always restores the previous state).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VERB_RE = /^(DECRETA|RESOLVE|SANCIONA|RESOLVER|BAIXA|DETERMINA|EXPEDE)\s*:/i;
const ARTICLE_RE = /^(Art\.|Artigo)\s+\d+[º°]?/i;
const PARAGRAPH_RE = /^§\s*\d+[º°]?\.?/;
const INCISO_RE = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)\s*[-–—]?\s/i;
const INCISO_ALPHA_RE = /^[a-z]\)\s+/i;
const PLACE_DATE_RE = /^[A-ZÀ-Ü][A-Za-zÀ-ÿ\- ]+[,.]?\s*,\s*\d{1,2}\s+de\s+[a-zçãéêíóôú]+\s+de\s+\d{4}\.?$/i;
const CARGO_RE = /^(Prefeito|Presidente|Governador|Secretário|Secretaria|Diretor|Superintendente|Ministro|Vereador|Procurador|Chefe|Coordenador|Assessor)\b/i;

export function formatOfficialAct(raw: string): string {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return "<p></p>";

  const lines = text.split("\n").map((l) => l.trimEnd());
  const out: string[] = [];

  // Tab-separated block => real table (only for clear tabular data).
  // Consecutive tab lines accumulate; flushed when a non-tab/blank line appears.
  const tabBlock: string[] = [];
  const flushTabBlock = () => {
    if (tabBlock.length) {
      out.push(tabToHtml(tabBlock));
      tabBlock.length = 0;
    }
  };

  let preambleOpen = false;
  let inConsiderando = false;

  const pushPreamble = (line: string) => {
    // Preamble: bold, justified.
    out.push(`<p style="text-align:justify"><strong>${escapeHtml(line)}</strong></p>`);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushTabBlock();
      // blank line closes consideration block
      inConsiderando = false;
      continue;
    }

    // Tabular detection: line with 2+ tab-separated non-empty cells.
    const cells = line.split("\t").map((c) => c.trim());
    if (cells.length >= 2 && cells.filter(Boolean).length >= 2) {
      tabBlock.push(line);
      continue;
    }

    flushTabBlock();

    if (VERB_RE.test(line)) {
      preambleOpen = false;
      inConsiderando = false;
      out.push(`<p style="text-align:center"><strong>${escapeHtml(line)}</strong></p>`);
      continue;
    }

    if (ARTICLE_RE.test(line)) {
      inConsiderando = false;
      const m = line.match(/^(Art\.|Artigo)\s+\d+[º°]?/i);
      const prefix = m ? m[0] : "";
      const rest = line.slice(prefix.length).trim();
      const body = rest ? ` ${escapeHtml(rest)}` : "";
      out.push(`<p style="text-align:justify"><strong>${escapeHtml(prefix)}</strong>${body}</p>`);
      continue;
    }

    if (PARAGRAPH_RE.test(line)) {
      inConsiderando = false;
      out.push(`<p style="text-align:justify;margin-left:2em"><strong>${escapeHtml(line)}</strong></p>`);
      continue;
    }

    if (INCISO_RE.test(line) || INCISO_ALPHA_RE.test(line)) {
      inConsiderando = false;
      out.push(`<p style="text-align:justify;margin-left:2em">${escapeHtml(line)}</p>`);
      continue;
    }

    if (/^CONSIDERANDO/i.test(line)) {
      inConsiderando = true;
      out.push(`<p style="text-align:justify;margin-left:1.5em"><strong>${escapeHtml(line)}</strong></p>`);
      continue;
    }
    if (inConsiderando) {
      out.push(`<p style="text-align:justify;margin-left:2.5em">${escapeHtml(line)}</p>`);
      continue;
    }

    if (PLACE_DATE_RE.test(line)) {
      inConsiderando = false;
      out.push(`<p style="text-align:center">${escapeHtml(line)}</p>`);
      continue;
    }

    if (CARGO_RE.test(line)) {
      // Cargo (office) — centered.
      inConsiderando = false;
      out.push(`<p style="text-align:center">${escapeHtml(line)}</p>`);
      continue;
    }

    // Authority name: title-cased (with optional lowercase particles), short.
    if (
      isAuthorityName(line) &&
      !PLACE_DATE_RE.test(line) &&
      !VERB_RE.test(line)
    ) {
      inConsiderando = false;
      out.push(`<p style="text-align:center"><strong>${escapeHtml(line)}</strong></p>`);
      continue;
    }

    // Default: preamble if before first verb, else plain justified paragraph.
    if (!preambleOpen) {
      // Only treat as preamble until we have seen a verb or article.
      if (out.length === 0 && !VERB_RE.test(line) && !ARTICLE_RE.test(line)) {
        preambleOpen = true;
        pushPreamble(line);
        continue;
      }
    } else {
      // still in preamble (no verb seen yet)
      pushPreamble(line);
      continue;
    }

    out.push(`<p style="text-align:justify">${escapeHtml(line)}</p>`);
  }

  flushTabBlock();
  return out.join("") || "<p></p>";
}

function isAuthorityName(line: string): boolean {
  // Title-cased name (optionally with lowercase particles), up to 6 words.
  if (line.length > 70 || line.endsWith(".")) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 6) return false;
  const particles = /^(de|da|do|dos|das|e|van|von|di)$/i;
  return words.every((w, i) => {
    if (i === 0) return /^[A-ZÀ-Ü]/.test(w);
    if (particles.test(w)) return true;
    return /^[A-ZÀ-Ü][a-zà-ÿ]+$/.test(w);
  });
}

function tabToHtml(lines: string[]): string {
  const rows = lines.map((l) => l.split("\t").map((c) => c.trim()));
  const colCount = Math.max(...rows.map((r) => r.length));
  const first = rows[0];
  // Header heuristics: all first-row cells short and without currency commas.
  const isHeader = first.length === colCount && first.every((c) => c && c.length <= 30 && !c.includes(","));
  const renderCell = (v: string, tag: string) =>
    `<${tag}><p>${escapeHtml(v).replace(/\n/g, "<br>") || "<br>"}</p></${tag}>`;
  const thead = isHeader
    ? `<thead>${rows.slice(0, 1).map((r) => `<tr>${r.map((c) => renderCell(c, "th")).join("")}</tr>`).join("")}</thead>`
    : "";
  const tbodyRows = isHeader ? rows.slice(1) : rows;
  const tbody = `<tbody>${tbodyRows.map((r) => `<tr>${r.map((c) => renderCell(c, "td")).join("")}</tr>`).join("")}</tbody>`;
  return `<table style="width:100%;border-collapse:collapse"><colgroup>${"<col/>".repeat(colCount)}</colgroup>${thead}${tbody}</table>`;
}
