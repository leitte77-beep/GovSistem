/**
 * Pure helpers to create and mutate semantic blocks. The editor keeps the
 * document canonical JSON as its single source of truth and re-renders from it.
 */
import type {
  ArticleBlock,
  SemanticBlock,
  SemanticBlockType,
  SemanticDocument,
} from "@/types/semantic";

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}`;
}

function base(type: SemanticBlockType, order: number): Partial<SemanticBlock> {
  return {
    id: newBlockId(),
    type,
    order,
    origin: "manual",
    confidence: 1,
    confirmed: false,
    metadata: {},
    content_hash: null,
  };
}

export function createEmptyBlock(type: SemanticBlockType, order: number): SemanticBlock {
  const b = base(type, order);
  switch (type) {
    case "heading":
      return { ...b, type, level: 1, text: "" } as SemanticBlock;
    case "command":
      return { ...b, type, text: "" } as SemanticBlock;
    case "article":
      return {
        ...b,
        type,
        number: null,
        suffix: null,
        caput: "",
        paragraphs: [],
        incisos: [],
        alineas: [],
        items: [],
        rich: true,
      } as ArticleBlock;
    case "paragraph_item":
      return { ...b, type, number: null, content: "", text: "", rich: true } as SemanticBlock;
    case "inciso":
      return { ...b, type, number: "", content: "", text: "", rich: true } as SemanticBlock;
    case "alinea":
      return { ...b, type, number: "", content: "", text: "", rich: true } as SemanticBlock;
    case "list":
      return { ...b, type, ordered: false, items: [""], content: "", rich: true } as SemanticBlock;
    case "table":
      return {
        ...b,
        type,
        caption: "",
        headers: [],
        rows: [[{ content: "", rowspan: 1, colspan: 1, header: false, is_total: false }]],
        column_widths: [],
        repeat_header: true,
        original_data: [],
      } as SemanticBlock;
    case "signature_block":
      return {
        ...b,
        type,
        entries: [{ name: "", role: "", organ: "", location: "", date: "" }],
        alignment: "center",
      } as SemanticBlock;
    case "attachment_reference":
      return { ...b, type, file_id: null, filename: "", title: "" } as SemanticBlock;
    case "image":
      return { ...b, type, src: "", alt: "", caption: "" } as SemanticBlock;
    case "quote":
      return { ...b, type, content: "", rich: true } as SemanticBlock;
    case "preamble":
    case "paragraph":
    case "legacy_html":
      return { ...b, type, content: "", rich: true } as SemanticBlock;
    case "page_break":
      return { ...b, type } as SemanticBlock;
    case "pdf_reference":
      return { ...b, type, src: "", page_count: 0, mode: "pdf_original" } as SemanticBlock;
    default:
      return { ...b, type } as SemanticBlock;
  }
}

/** Update a block by id, preserving its identity and re-assigning content_hash=null. */
export function updateBlock(doc: SemanticDocument, id: string, patch: Partial<SemanticBlock>): SemanticDocument {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.id === id ? ({ ...b, ...patch, id, content_hash: null } as SemanticBlock) : b
    ),
  };
}

function reorder(doc: SemanticDocument, blocks: SemanticBlock[]): SemanticDocument {
  return {
    ...doc,
    blocks: blocks.map((b, i) => ({ ...b, order: i, content_hash: null })),
  };
}

/** Insert a new block after the given id (or at the end). */
export function insertBlockAfter(doc: SemanticDocument, afterId: string | null, type: SemanticBlockType): SemanticDocument {
  const index = afterId ? doc.blocks.findIndex((b) => b.id === afterId) : doc.blocks.length - 1;
  const at = index >= 0 ? index + 1 : doc.blocks.length;
  const block = createEmptyBlock(type, at);
  const blocks = [...doc.blocks];
  blocks.splice(at, 0, block);
  return reorder(doc, blocks);
}

/** Remove a block by id. */
export function removeBlock(doc: SemanticDocument, id: string): SemanticDocument {
  return reorder(doc, doc.blocks.filter((b) => b.id !== id));
}

/** Duplicate a block right after itself. */
export function duplicateBlock(doc: SemanticDocument, id: string): SemanticDocument {
  const index = doc.blocks.findIndex((b) => b.id === id);
  if (index < 0) return doc;
  const source = doc.blocks[index];
  const copy = { ...source, id: newBlockId(), order: index + 1, content_hash: null } as SemanticBlock;
  const blocks = [...doc.blocks];
  blocks.splice(index + 1, 0, copy);
  return reorder(doc, blocks);
}

/** Move a block up/down. */
export function moveBlock(doc: SemanticDocument, id: string, dir: -1 | 1): SemanticDocument {
  const index = doc.blocks.findIndex((b) => b.id === id);
  const target = index + dir;
  if (index < 0 || target < 0 || target >= doc.blocks.length) return doc;
  const blocks = [...doc.blocks];
  const [block] = blocks.splice(index, 1);
  blocks.splice(target, 0, block);
  return reorder(doc, blocks);
}

/** Split a paragraph/rich block into two at the given content offset. */
export function splitBlock(doc: SemanticDocument, id: string, offset: number): SemanticDocument {
  const index = doc.blocks.findIndex((b) => b.id === id);
  if (index < 0) return doc;
  const block = doc.blocks[index];
  if (!("content" in block) && !("caput" in block)) return doc;
  const text = "content" in block ? String(block.content) : "";
  if (!text) return doc;
  const safeOffset = Math.min(Math.max(0, offset), text.length);
  const firstText = text.slice(0, safeOffset).trim();
  const secondText = text.slice(safeOffset).trim();
  const clone = { ...block, id: newBlockId(), order: index + 1 } as SemanticBlock;
  const blocks = [...doc.blocks];
  blocks[index] = { ...block, content: firstText, content_hash: null } as SemanticBlock;
  blocks.splice(index + 1, 0, { ...clone, content: secondText } as SemanticBlock);
  return reorder(doc, blocks);
}
