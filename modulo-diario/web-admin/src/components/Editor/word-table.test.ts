import { Editor } from "@tiptap/core";
import { extensions } from "./extensions";

/**
 * Quadros importados do Word (avisos de licitação, termos de homologação)
 * carregam a forma do ato: bordas por lado, faixas coloridas e larguras. Ao
 * passar pelo editor, o HTML voltava com `style=""` vazio e o documento era
 * publicado sem nada disso.
 *
 * As asserções leem o CSS pelo CSSOM em vez de comparar texto: o navegador
 * normaliza cores e agrupa as bordas, e o que importa é o valor aplicado.
 */
const QUADRO =
  '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
  '<tbody><tr>' +
  '<td style="border-top:0.5pt solid #000000;border-bottom:0.5pt solid #000000;' +
  'border-left:none;border-right:none;background-color:#FFF2CC;' +
  'vertical-align:middle;width:12%"><p>Item</p></td>' +
  '<td style="border-top:0.5pt solid #000000;border-bottom:0.5pt solid #000000;' +
  'width:88%"><p>Descrição</p></td>' +
  "</tr></tbody></table>";

function roundtrip(html: string): string {
  const editor = new Editor({ extensions, content: html });
  editor.commands.setContent(editor.getJSON());
  const out = editor.getHTML();
  editor.destroy();
  return out;
}

function styleOf(html: string, selector: string): CSSStyleDeclaration {
  const host = document.createElement("div");
  host.innerHTML = html;
  const element = host.querySelector(selector);
  if (!element) throw new Error(`elemento ${selector} não encontrado em ${html}`);
  return (element as HTMLElement).style;
}

it("keeps cell borders, shading, width and vertical alignment", () => {
  const cell = styleOf(roundtrip(QUADRO), "td");
  expect(cell.backgroundColor).toBe("rgb(255, 242, 204)");
  expect(cell.borderTopWidth).toBe("0.5pt");
  expect(cell.borderTopStyle).toBe("solid");
  expect(cell.borderBottomStyle).toBe("solid");
  expect(cell.borderLeftStyle).toBe("none");
  expect(cell.borderRightStyle).toBe("none");
  expect(cell.verticalAlign).toBe("middle");
  expect(cell.width).toBe("12%");
});

it("keeps the table's own layout attributes", () => {
  const table = styleOf(roundtrip(QUADRO), "table");
  expect(table.borderCollapse).toBe("collapse");
  expect(table.tableLayout).toBe("fixed");
  expect(table.width).toBe("100%");
});

it("does not lose the cell text", () => {
  const html = roundtrip(QUADRO);
  expect(html).toContain("Item");
  expect(html).toContain("Descrição");
});
