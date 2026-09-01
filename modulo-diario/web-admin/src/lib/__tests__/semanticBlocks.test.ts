import { describe, it, expect } from "vitest";
import type { SemanticDocument, SemanticBlock } from "@/types/semantic";
import {
  createEmptyBlock,
  insertBlockAfter,
  removeBlock,
  duplicateBlock,
  moveBlock,
  updateBlock,
  splitBlock,
} from "@/lib/semanticBlocks";

function makeDoc(blocks: SemanticBlock[]): SemanticDocument {
  return {
    schema_version: 1,
    document_id: "doc1",
    document_type: "ato_oficial",
    title: "Decreto",
    summary: "",
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    source_type: "manual",
    classification_status: "pending",
    blocks: blocks.map((b, i) => ({ ...b, order: i })),
  };
}

const heading = createEmptyBlock("heading", 0) as SemanticBlock;
const article = createEmptyBlock("article", 1) as SemanticBlock;
const paragraph = createEmptyBlock("paragraph", 2) as SemanticBlock;

describe("semanticBlocks", () => {
  it("insertBlockAfter insere na posição correta", () => {
    const doc = makeDoc([heading, paragraph]);
    const next = insertBlockAfter(doc, heading.id, "article");
    expect(next.blocks.map((b) => b.type)).toEqual(["heading", "article", "paragraph"]);
    expect(next.blocks.map((b) => b.order)).toEqual([0, 1, 2]);
  });

  it("insertBlockAfter(null) insere no final", () => {
    const doc = makeDoc([heading]);
    const next = insertBlockAfter(doc, null, "paragraph");
    expect(next.blocks.map((b) => b.type)).toEqual(["heading", "paragraph"]);
  });

  it("removeBlock remove e renumera", () => {
    const doc = makeDoc([heading, article, paragraph]);
    const next = removeBlock(doc, article.id);
    expect(next.blocks.map((b) => b.type)).toEqual(["heading", "paragraph"]);
    expect(next.blocks.map((b) => b.order)).toEqual([0, 1]);
  });

  it("duplicateBlock copia conteúdo com novo id", () => {
    const withContent = { ...heading, text: "Título X" } as SemanticBlock;
    const doc = makeDoc([withContent]);
    const next = duplicateBlock(doc, withContent.id);
    expect(next.blocks).toHaveLength(2);
    expect(next.blocks[1].type).toBe("heading");
    expect((next.blocks[1] as any).text).toBe("Título X");
    expect(next.blocks[1].id).not.toBe(withContent.id);
  });

  it("moveBlock move para cima/baixo", () => {
    const doc = makeDoc([heading, article, paragraph]);
    const up = moveBlock(doc, article.id, -1);
    expect(up.blocks.map((b) => b.type)).toEqual(["article", "heading", "paragraph"]);
    const down = moveBlock(up, article.id, 1);
    expect(down.blocks.map((b) => b.type)).toEqual(["heading", "article", "paragraph"]);
  });

  it("updateBlock aplica patch e zera content_hash", () => {
    const doc = makeDoc([heading]);
    const next = updateBlock(doc, heading.id, { text: "Novo" });
    expect((next.blocks[0] as any).text).toBe("Novo");
    expect(next.blocks[0].content_hash).toBeNull();
  });

  it("splitBlock divide conteúdo em dois blocos", () => {
    const p = { ...paragraph, content: "primeira segunda" } as SemanticBlock;
    const doc = makeDoc([p]);
    const next = splitBlock(doc, p.id, 8);
    expect(next.blocks).toHaveLength(2);
    expect((next.blocks[0] as any).content).toBe("primeira");
    expect((next.blocks[1] as any).content).toBe("segunda");
  });

  it("createEmptyBlock cria tabela e assinatura válidas", () => {
    const t = createEmptyBlock("table", 0) as any;
    expect(t.type).toBe("table");
    expect(Array.isArray(t.rows)).toBe(true);
    expect(t.rows[0][0]).toMatchObject({ rowspan: 1, colspan: 1 });
    const s = createEmptyBlock("signature_block", 0) as any;
    expect(s.entries).toHaveLength(1);
  });
});
