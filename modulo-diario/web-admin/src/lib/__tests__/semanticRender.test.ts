import { describe, it, expect } from "vitest";
import { createEmptyBlock } from "@/lib/semanticBlocks";
import { blockToHtml, documentToHtml } from "@/lib/semanticRender";
import type { SemanticBlock } from "@/types/semantic";

describe("semanticRender", () => {
  it("renderiza heading com nível e texto escapado", () => {
    const b = { ...createEmptyBlock("heading", 0), text: "Decreto <b>x</b>" } as SemanticBlock;
    const html = blockToHtml(b);
    expect(html).toContain("<h1");
    expect(html).toContain("Decreto &lt;b&gt;x&lt;/b&gt;");
  });

  it("renderiza comando centralizado", () => {
    const b = { ...createEmptyBlock("command", 0), text: "DECRETA:" } as SemanticBlock;
    expect(blockToHtml(b)).toContain("<strong>DECRETA:</strong>");
  });

  it("renderiza tabela com rowspan/colspan e célula de total", () => {
    const t = createEmptyBlock("table", 0) as any;
    t.headers = ["Col A", "Col B"];
    t.rows = [[
      { content: "1", rowspan: 2, colspan: 1, header: false, is_total: false },
      { content: "2", rowspan: 1, colspan: 2, header: true, is_total: false },
    ]];
    t.caption = "Orçamento";
    const html = blockToHtml(t);
    expect(html).toContain("rowspan=\"2\"");
    expect(html).toContain("colspan=\"2\"");
    expect(html).toContain("<figcaption>Orçamento</figcaption>");
  });

  it("renderiza artigo com caput e parágrafos", () => {
    const a = createEmptyBlock("article", 0) as any;
    a.number = "1";
    a.caput = "Fica instituído…";
    a.paragraphs = [{ type: "paragraph_item", number: null, content: "Parágrafo único…", id: "p1", order: 0 }];
    const html = blockToHtml(a);
    expect(html).toContain("Art. 1.");
    expect(html).toContain("Parágrafo único.");
  });

  it("documentToHtml mantém ordem dos blocos", () => {
    const b1 = { ...createEmptyBlock("heading", 0), text: "A" } as SemanticBlock;
    const b2 = { ...createEmptyBlock("paragraph", 1), content: "B" } as SemanticBlock;
    const html = documentToHtml({ blocks: [b1, b2] } as any);
    const iA = html.indexOf(">A<");
    const iB = html.indexOf(">B<");
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(iB).toBeGreaterThan(iA);
  });
});
