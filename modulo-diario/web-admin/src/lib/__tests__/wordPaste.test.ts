import { readFileSync } from "fs";
import path from "path";
import { Editor } from "@tiptap/core";
import { extensions } from "@/components/Editor/extensions";
import { stripWordMso } from "@/lib/sanitize";
import { cleanPastedHtml, columnPercentages, lengthToPt } from "@/lib/clipboard";
import { applyPastedDocumentStyles, parseStyleRules } from "@/lib/wordStyles";

/**
 * Colagem real do Word: negrito, caixa alta e recuo vêm de estilos nomeados
 * no <style> do <head> (Título 1, Ementa, Preâmbulo) e de trechos com
 * `text-transform`/versalete. O caminho é o mesmo do editor: estilos →
 * limpeza do Word → limpeza da colagem → TipTap.
 */
const WORD = readFileSync(path.join(__dirname, "fixtures/word-decreto.html"), "utf8");

function pasteThroughEditor(raw: string): string {
  const styled = applyPastedDocumentStyles(raw);
  const { html } = cleanPastedHtml(stripWordMso(styled));
  const editor = new Editor({ extensions, content: html });
  const out = editor.getHTML();
  editor.destroy();
  return out;
}

function host(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

function paragraphWith(html: string, text: string): HTMLElement {
  const found = Array.from(host(html).querySelectorAll("p, h1, h2, h3"))
    .find((p) => (p.textContent || "").includes(text));
  if (!found) throw new Error(`parágrafo com "${text}" não encontrado em ${html}`);
  return found as HTMLElement;
}

describe("colagem do Word — estilos nomeados", () => {
  const out = pasteThroughEditor(WORD);

  it("título em estilo Título 1 sai em caixa alta de verdade", () => {
    expect(out).toContain("DECRETO Nº 2748/2026");
  });

  it("súmula (estilo Ementa) mantém negrito, caixa alta e recuo à direita", () => {
    const sumula = paragraphWith(out, "SÚMULA");
    expect(sumula.textContent).toContain("ABRE CRÉDITO ADICIONAL SUPLEMENTAR");
    expect(sumula.querySelector("strong")?.textContent).toContain("SÚMULA");
    expect(sumula.style.marginLeft).toBe("212.65pt");
    expect(sumula.style.textAlign).toBe("justify");
  });

  it("preâmbulo (estilo Preambulo) sai em negrito e caixa alta", () => {
    const preambulo = paragraphWith(out, "PREFEITO DO MUNICÍPIO");
    expect(preambulo.querySelector("strong")).not.toBeNull();
    expect(preambulo.textContent).toContain("LEI ORGÂNICA MUNICIPAL");
  });

  it("negrito por estilo de caractere ('Art. 1º', nome do signatário) vira <strong>", () => {
    expect(paragraphWith(out, "Art. 1º").querySelector("strong")?.textContent).toBe("Art. 1º");
    expect(paragraphWith(out, "Oclécio").querySelector("strong")).not.toBeNull();
  });

  it("caixa alta e versalete aplicados num trecho viram maiúsculas", () => {
    const art = paragraphWith(out, "Art. 1º");
    expect(art.textContent).toContain("ORÇAMENTO GERAL");
    expect(art.textContent).toContain("TABELA ABAIXO");
    expect(art.textContent).toContain("do município");
  });

  it("não altera o texto que não estava em caixa alta", () => {
    expect(out).toContain("Fica aberto Crédito Adicional Suplementar");
    expect(out).toContain("Farol, 08 de outubro de 2026.");
  });
});

describe("colagem do Word — tabela", () => {
  const out = pasteThroughEditor(WORD);
  const table = host(out).querySelector("table")!;

  it("larguras do Word (cm/pt) viram percentuais que somam 100%", () => {
    const widths = Array.from(table.querySelectorAll("tr:first-child > *"))
      .map((cell) => parseFloat((cell as HTMLElement).style.width));
    expect(widths).toEqual([12.5, 62.5, 25]);
  });

  it("célula mesclada recebe a soma das colunas que ocupa", () => {
    const total = table.querySelector("tr:last-child > td") as HTMLElement;
    expect(total.getAttribute("colspan")).toBe("2");
    expect(parseFloat(total.style.width)).toBe(75);
  });

  it("primeira linha em negrito vira cabeçalho repetível (<th>)", () => {
    expect(table.querySelectorAll("tr:first-child > th")).toHaveLength(3);
    expect(table.querySelectorAll("tr:nth-child(2) > td")).toHaveLength(3);
    expect(table.querySelectorAll("th")).toHaveLength(3);
  });

  it("fundo `background:` do Word vira background-color", () => {
    const th = table.querySelector("th") as HTMLElement;
    expect(th.style.backgroundColor).toBe("rgb(217, 226, 243)");
  });

  it("lado sem borda no Word continua sem borda", () => {
    const second = table.querySelectorAll("th")[1] as HTMLElement;
    expect(second.style.borderLeftStyle).toBe("none");
    expect(second.style.borderTopStyle).toBe("solid");
  });

  it("cor de borda `windowtext` (só existe no Word) vira preto", () => {
    expect(out).not.toMatch(/windowtext/i);
  });

  it("tabela com 2 linhas não ganha cabeçalho inventado", () => {
    const { html } = cleanPastedHtml(
      "<table><tr><td><b>A</b></td><td><b>B</b></td></tr><tr><td>1</td><td>2</td></tr></table>",
    );
    expect(html).not.toContain("<th");
  });
});

describe("unidades e larguras", () => {
  it("converte unidades do Word para pt", () => {
    expect(lengthToPt("2.0cm")).toBeCloseTo(56.69, 1);
    expect(lengthToPt("453.1pt")).toBe(453.1);
    expect(lengthToPt("76")).toBe(57);
    expect(lengthToPt("auto")).toBeNull();
  });

  it("colunas sem largura dividem o que sobra; mesclagem não confunde a grade", () => {
    const t = host(
      '<table><tr><td colspan="2">título</td></tr>' +
      '<tr><td style="width:30pt">a</td><td>b</td></tr></table>',
    ).querySelector("table")!;
    const result = columnPercentages(Array.from(t.querySelectorAll("tr")));
    expect(result?.widths).toEqual([50, 50]);
  });

  it("sem largura nenhuma, deixa o PDF calcular", () => {
    const t = host("<table><tr><td>a</td><td>b</td></tr></table>").querySelector("table")!;
    expect(columnPercentages(Array.from(t.querySelectorAll("tr")))).toBeNull();
  });
});

describe("parseStyleRules", () => {
  it("lê só seletores simples e só propriedades tipográficas", () => {
    const rules = parseStyleRules(
      "<!-- p.Ementa, li.Ementa {margin-left:212pt;font-size:12pt;font-weight:bold} " +
      "table td p {font-weight:bold} @page S1 {size:595pt 842pt;} -->",
    );
    expect(rules.map((r) => `${r.tag}.${r.className}`)).toEqual(["p.Ementa", "li.Ementa"]);
    expect(Array.from(rules[0].declarations.keys())).toEqual(["margin-left", "font-weight"]);
  });

  it("estilo próprio do elemento vence a regra (como no Word)", () => {
    const html = applyPastedDocumentStyles(
      "<html><head><style>p.X{text-align:justify;font-weight:bold}</style></head>" +
      '<body><p class="X" style="text-align:center">ok</p></body></html>',
    );
    const p = host(html).querySelector("p")!;
    expect(p.style.textAlign).toBe("center");
    expect(p.querySelector("strong")?.textContent).toBe("ok");
  });

  it("text-transform:none dentro de parágrafo em caixa alta preserva a grafia", () => {
    const html = applyPastedDocumentStyles(
      '<p style="text-transform:uppercase">lei nº 14.133 <span style="text-transform:none">e-mail</span></p>',
    );
    expect(host(html).textContent).toBe("LEI Nº 14.133 e-mail");
  });
});
