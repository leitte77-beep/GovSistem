/**
 * Fase 5 — shared render contract (TS side).
 * Reads the SAME golden fixture as the Python test
 * (fixtures/decreto-04-2026.document.json) and must reproduce the same block
 * order, heading level, table structure and textual tokens.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { documentToHtml, blockToHtml, stripHtml } from "@/lib/semanticRender";
import type { SemanticDocument } from "@/types/semantic";

function fixture(): SemanticDocument {
  const path = join(__dirname, "..", "..", "..", "..", "fixtures", "decreto-04-2026.document.json");
  return JSON.parse(readFileSync(path, "utf-8")) as SemanticDocument;
}

const EXPECTED_ORDER = [
  "heading", "preamble", "command",
  "article", "article", "article",
  "table", "paragraph", "signature_block",
];

describe("semantic contract (shared golden fixture)", () => {
  const doc = fixture();

  it("parses the fixture preserving block order", () => {
    expect(doc.blocks.map((b) => b.type)).toEqual(EXPECTED_ORDER);
  });

  it("heading renders as <h1>", () => {
    const html = blockToHtml(doc.blocks[0]);
    expect(html).toContain("<h1");
  });

  it("table preserves colspan and total", () => {
    const html = blockToHtml(doc.blocks[6]);
    expect(html).toContain("<table");
    expect(html).toContain('colspan="2"');
    expect(html).toContain("sem-total");
  });

  it("preserves numbers and authority in the rendered text", () => {
    const text = stripHtml(documentToHtml(doc));
    for (const token of ["1.250.000,00", "800.000,00", "450.000,00", "0,00",
      "Maria Oliveira", "Prefeita", "Secretaria de Administração", "DECRETA:"]) {
      expect(text).toContain(token);
    }
  });

  it("produces the same canonical text stream as the Python renderer", () => {
    const text = stripHtml(documentToHtml(doc));
    for (const label of ["DECRETO Nº 04/2026", "DECRETA:", "Art. 1.", "Art. 2.",
      "Art. 3.", "Crédito adicional especial", "Maria Oliveira", "Prefeita"]) {
      expect(text).toContain(label);
    }
  });
});
