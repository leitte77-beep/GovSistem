import { describe, expect, it } from "vitest";
import { htmlParaTexto, pareceHtml, sanitizarHtmlEvolucao } from "@/nucleo/htmlSeguro";

describe("pareceHtml", () => {
  it("detecta tags e entidades HTML", () => {
    expect(pareceHtml("<p>olá</p>")).toBe(true);
    expect(pareceHtml("texto com&nbsp;entidade")).toBe(true);
    expect(pareceHtml("a &amp; b")).toBe(true);
  });

  it("não acusa texto puro", () => {
    expect(pareceHtml("Evolução técnica simples, sem marcação.")).toBe(false);
    expect(pareceHtml("valor a < b e c > d sem tag")).toBe(false);
  });
});

describe("sanitizarHtmlEvolucao", () => {
  it("mantém formatação permitida", () => {
    const out = sanitizarHtmlEvolucao("<p><b>negrito</b> e <i>itálico</i></p>");
    expect(out).toContain("<b>negrito</b>");
    expect(out).toContain("<i>itálico</i>");
  });

  it("decodifica &nbsp; como espaço não separável (não aparece literal)", () => {
    const out = sanitizarHtmlEvolucao("testando novamente mais uma ação&nbsp; fim");
    expect(out).not.toContain("&nbsp;".repeat(2));
    expect(out).not.toMatch(/&nbsp;&nbsp;/);
    // O literal "&nbsp;" digitado não sobrevive como texto visível.
    expect(htmlParaTexto(out)).toBe("testando novamente mais uma ação fim");
  });

  it("remove scripts e atributos perigosos", () => {
    const out = sanitizarHtmlEvolucao(
      '<p onclick="hack()">a</p><script>alert(1)</script><img src=x onerror=alert(1)>',
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).toContain("a");
  });

  it("desembrulha tags desconhecidas preservando o texto", () => {
    const out = sanitizarHtmlEvolucao("<article><p>conteúdo</p></article>");
    expect(out).not.toContain("article");
    expect(out).toContain("<p>conteúdo</p>");
  });
});

describe("htmlParaTexto", () => {
  it("extrai texto puro normalizando espaços", () => {
    expect(htmlParaTexto("<p>olá&nbsp; <b>mundo</b></p>")).toBe("olá mundo");
  });
});
