/**
 * Client-side rendering of semantic blocks to safe HTML.
 * Mirrors the backend renderer (app/semantic/renderer.py) so the editor and
 * review share one mental model. Output is deterministic and uses stable
 * classes. Rich text is trusted only because it originates from the backend
 * sanitizer; we still strip a few risky tags as a defensive layer.
 */
import type { SemanticBlock, SemanticDocument } from "@/types/semantic";

function esc(s: string | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BLOCK_TAG: Record<string, string> = {
  heading: "h2",
  preamble: "p",
  command: "p",
  paragraph: "p",
  paragraph_item: "p",
  inciso: "p",
  alinea: "p",
  quote: "blockquote",
};

export function blockToHtml(block: SemanticBlock): string {
  switch (block.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, block.level || 1));
      return `<h${level} class="sem-block sem-heading">${esc(block.text)}</h${level}>`;
    }
    case "command":
      return `<p class="sem-block sem-command"><strong>${esc(block.text)}</strong></p>`;
    case "preamble":
      return `<p class="sem-block sem-preamble">${esc(block.content)}</p>`;
    case "paragraph":
      return `<p class="sem-block sem-paragraph">${esc(block.content)}</p>`;
    case "paragraph_item":
      return `<p class="sem-block sem-paragraph-item">${esc(block.number ? `§ ${block.number}. ` : "Parágrafo único. ")}${esc(block.content)}</p>`;
    case "inciso":
      return `<p class="sem-block sem-inciso" style="padding-left:2rem">${esc(block.number)} – ${esc(block.content)}</p>`;
    case "alinea":
      return `<p class="sem-block sem-alinea" style="padding-left:4rem">${esc(block.number)}) ${esc(block.content)}</p>`;
    case "list":
      return block.ordered
        ? `<ol class="sem-block sem-list">${block.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`
        : `<ul class="sem-block sem-list">${block.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "table": {
      const head = block.headers.length
        ? `<thead><tr>${block.headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>`
        : "";
      const body = block.rows.length
        ? `<tbody>${block.rows
            .map(
              (row) =>
                `<tr>${row
                  .map(
                    (c) =>
                      `<${c.header ? "th" : "td"}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ""}${
                        c.colspan > 1 ? ` colspan="${c.colspan}"` : ""
                      }${c.align ? ` style="text-align:${c.align}"` : ""}${
                        c.is_total ? ' class="sem-total"' : ""
                      }>${esc(c.content)}</${c.header ? "th" : "td"}>`
                  )
                  .join("")}</tr>`
            )
            .join("")}</tbody>`
        : "";
      return `<figure class="sem-block sem-table"><table>${head}${body}</table>${
        block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""
      }</figure>`;
    }
    case "image":
      return `<figure class="sem-block sem-image"><img src="${esc(block.src)}" alt="${esc(
        block.alt
      )}" loading="lazy"/>${
        block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""
      }</figure>`;
    case "quote":
      return `<blockquote class="sem-block sem-quote">${esc(block.content)}</blockquote>`;
    case "page_break":
      return `<div class="sem-block sem-page-break" aria-hidden="true"><hr /></div>`;
    case "signature_block":
      return `<div class="sem-block sem-signature">${block.entries
        .map(
          (e) =>
            `<div class="sem-signature-entry" style="text-align:${esc(
              block.alignment || "center"
            )}"><div class="sem-signature-name"><strong>${esc(e.name)}</strong></div><div>${esc(
              e.role
            )}</div>${e.organ ? `<div>${esc(e.organ)}</div>` : ""}${
              e.location ? `<div>${esc(e.location)}</div>` : ""
            }${e.date ? `<div>${esc(e.date)}</div>` : ""}</div>`
        )
        .join("")}</div>`;
    case "attachment_reference":
      return `<p class="sem-block sem-attachment">Anexo: <strong>${esc(block.title || block.filename)}</strong></p>`;
    case "pdf_reference":
      return `<p class="sem-block sem-pdf-ref">PDF original (${block.page_count || ""} páginas)</p>`;
    case "legacy_html":
      return `<div class="sem-block sem-legacy">${block.content || ""}</div>`;
    case "article": {
      const label = `Art. ${block.suffix || block.number || ""}`.trim() || "Art.";
      const inner: string[] = [];
      inner.push(`<p class="sem-article-caput">${label}. ${esc(block.caput)}</p>`);
      for (const p of block.paragraphs) {
        inner.push(
          `<p class="sem-article-paragraph" style="padding-left:1rem">${
            p.number ? `§ ${p.number}. ` : "Parágrafo único. "
          }${esc(p.content)}</p>`
        );
      }
      for (const i of block.incisos) {
        inner.push(`<p class="sem-article-inciso" style="padding-left:2rem">${esc(i.number)} – ${esc(i.content)}</p>`);
      }
      for (const a of block.alineas) {
        inner.push(`<p class="sem-article-alinea" style="padding-left:3rem">${esc(a.number)}) ${esc(a.content)}</p>`);
      }
      return `<div class="sem-block sem-article">${inner.join("")}</div>`;
    }
    default:
      return `<p class="sem-block">${esc(JSON.stringify(block))}</p>`;
  }
}

export function documentToHtml(doc: SemanticDocument): string {
  return doc.blocks.map((b) => blockToHtml(b)).join("\n");
}

export function stripHtml(value: string): string {
  if (!value) return "";
  const text = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const div = typeof document !== "undefined" ? document.createElement("div") : null;
  if (div) {
    div.innerHTML = value;
    return (div.textContent || "").replace(/\s+/g, " ").trim();
  }
  return text;
}

export function blockLabel(block: SemanticBlock): string {
  switch (block.type) {
    case "heading":
      return esc(block.text) || "Título";
    case "command":
      return esc(block.text);
    case "article":
      return `Art. ${block.suffix || block.number || ""}`.trim();
    case "paragraph_item":
      return block.number ? `§ ${block.number}` : "Parágrafo único";
    case "inciso":
      return block.number;
    case "alinea":
      return `${block.number})`;
    case "paragraph":
    case "preamble":
    case "quote":
    case "legacy_html":
      return stripHtml(block.content).slice(0, 80) || "…";
    case "table":
      return block.caption || "Tabela";
    default:
      return block.type;
  }
}
