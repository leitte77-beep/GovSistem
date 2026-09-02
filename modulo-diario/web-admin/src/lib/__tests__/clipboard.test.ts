import { describe, it, expect } from "vitest";
import { cleanPastedHtml, detectPdfExtractedText } from "@/lib/clipboard";
import { plainTextToStructuredHtml } from "@/lib/contentAutoformat";

describe("cleanPastedHtml (rich paste)", () => {
  it("preserva estrutura de tabela e cabeçalhos (<th>)", () => {
    const html = `
      <table>
        <tr><th>Descrição</th><th>Valor em R$</th></tr>
        <tr><td>Material</td><td>45.500,00</td></tr>
      </table>`;
    const { html: out } = cleanPastedHtml(html);
    expect(out).toContain("<table");
    expect(out).toMatch(/<th[\s>]/);
    expect(out).toMatch(/<td[\s>]/);
  });

  it("preserva colspan e rowspan", () => {
    const html = '<table><tr><td colspan="2" rowspan="3">célula</td><td>x</td></tr></table>';
    const { html: out } = cleanPastedHtml(html);
    expect(out).toContain('colspan="2"');
    expect(out).toContain('rowspan="3"');
  });

  it("preserva alinhamento, bordas e larguras", () => {
    const html = '<table><tr><td style="text-align:right;width:120px">1</td></tr></table>';
    const { html: out } = cleanPastedHtml(html);
    expect(out).toMatch(/text-align\s*:\s*right/i);
    expect(out).toMatch(/border/);
    expect(out).toMatch(/width\s*:\s*120px/i);
  });

  it("remove scripts, iframes e atributos de evento", () => {
    const html = '<script>alert(1)</script><p onclick="evil()">ok</p>';
    const { html: out, warnings } = cleanPastedHtml(html);
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("remove URLs javascript perigosas", () => {
    const html = '<p><a href="javascript:alert(1)">x</a></p>';
    const { html: out } = cleanPastedHtml(html);
    expect(out).not.toContain("javascript:");
  });
});

describe("plain text → structured (no silent tables)", () => {
  it("texto sem TAB não cria tabela", () => {
    const out = plainTextToStructuredHtml("Linha um\nLinha dois\nLinha três");
    expect(out).not.toContain("<table");
    expect(out).toContain("<p>");
  });
});

describe("detectPdfExtractedText", () => {
  it("detecta colunas separadas por espaços e linhas curtas", () => {
    const txt = ["Item        Valor     Qtd",
      "Caneta       2,50      10",
      "Papel       15,00     100"].join("\n");
    const res = detectPdfExtractedText(txt);
    expect(res.likely).toBe(true);
    expect(res.reasons.length).toBeGreaterThan(0);
  });

  it("texto comum não é sinalizado como PDF", () => {
    const txt = "Este é um parágrafo normal.\n\nOutro parágrafo com mais conteúdo e pontuação adequada.";
    expect(detectPdfExtractedText(txt).likely).toBe(false);
  });
});
