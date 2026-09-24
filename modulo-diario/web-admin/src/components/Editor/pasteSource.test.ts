import { describe, expect, it } from "vitest";

import { extractPasteSource } from "./index";

function clipboard(data: Record<string, string>) {
  return (type: string) => data[type] ?? "";
}

describe("extractPasteSource", () => {
  it("captura HTML do Word e marca como Office", () => {
    const src = extractPasteSource(
      clipboard({
        "text/html": '<p class="MsoNormal">RESOLVE</p>',
        "text/plain": "RESOLVE",
      })
    );
    expect(src).not.toBeNull();
    expect(src!.html).toContain("MsoNormal");
    expect(src!.plain).toBe("RESOLVE");
    expect(src!.isOffice).toBe(true);
  });

  it("captura tabela de planilha com namespaces como Office", () => {
    const src = extractPasteSource(
      clipboard({
        "text/html": '<table xmlns:x="urn:schemas-microsoft-com:office:excel">',
        "text/plain": "A\tB",
      })
    );
    expect(src!.html).toContain("<table");
    expect(src!.isOffice).toBe(true);
  });

  it("captura HTML do navegador sem marcar como Office", () => {
    const src = extractPasteSource(
      clipboard({ "text/html": "<p>Texto do navegador</p>", "text/plain": "Texto do navegador" })
    );
    expect(src!.isOffice).toBe(false);
    expect(src!.html).toContain("navegador");
  });

  it("captura apenas texto simples (PDF extraído)", () => {
    const src = extractPasteSource(clipboard({ "text/plain": "Linha 1\nLinha 2" }));
    expect(src).toEqual({ html: "", plain: "Linha 1\nLinha 2", isOffice: false });
  });

  it("retorna null quando não há HTML nem texto", () => {
    expect(extractPasteSource(clipboard({}))).toBeNull();
  });
});
