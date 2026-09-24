import { describe, it, expect } from "vitest";
import { formatOfficialAct } from "@/lib/officialActFormat";

const FIXTURE = `O PREFEITO MUNICIPAL DE FAROL, no uso de suas atribuições legais,
DECRETA:
Art. 1º Fica criada a Secretaria Municipal de Tecnologia.
Art. 2º A dotação para o exercício fica assim distribuída:
Descrição	Elemento da Despesa	Vínculo	Valor em R$
Tecnologia	Pessoal	01.02	120.000,00
Tecnologia	Material	01.03	45.500,00
Art. 3º Este Decreto entra em vigor na data de sua publicação.
Farol, 15 de julho de 2026.
José da Silva
Prefeito Municipal`;

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("formatOfficialAct", () => {
  it("não altera nenhuma palavra ou número", () => {
    const html = formatOfficialAct(FIXTURE);
    const out = plainText(html);
    for (const token of ["O PREFEITO MUNICIPAL DE FAROL", "no uso de suas atribuições legais",
      "DECRETA:", "Art. 1º", "Secretaria Municipal de Tecnologia", "120.000,00",
      "45.500,00", "01.02", "Farol, 15 de julho de 2026.", "José da Silva", "Prefeito Municipal"]) {
      expect(out).toContain(token);
    }
  });

  it("centraliza DECRETA: em negrito", () => {
    const html = formatOfficialAct(FIXTURE);
    expect(html).toContain('<p style="text-align:center"><strong>DECRETA:</strong></p>');
  });

  it("mantém o prefixo dos artigos em negrito", () => {
    const html = formatOfficialAct(FIXTURE);
    expect(html).toContain("<strong>Art. 1º</strong>");
    expect(html).toContain("<strong>Art. 3º</strong>");
  });

  it("converte bloco tabular em tabela real com cabeçalho", () => {
    const html = formatOfficialAct(FIXTURE);
    expect(html).toContain("<table");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>");
    expect(html).toContain("<td>");
  });

  it("centraliza nome e cargo", () => {
    const html = formatOfficialAct(FIXTURE);
    expect(html).toContain('<p style="text-align:center"><strong>José da Silva</strong></p>');
    expect(html).toContain('<p style="text-align:center">Prefeito Municipal</p>');
  });

  it("preserva corpo do preâmbulo em negrito/justificado", () => {
    const html = formatOfficialAct(FIXTURE);
    expect(html).toContain('text-align:justify');
    expect(html).toContain("<strong>O PREFEITO MUNICIPAL DE FAROL");
  });

  it("não fabrica estrutura para texto simples", () => {
    const html = formatOfficialAct("Apenas um texto corrido sem estrutura de ato.");
    expect(html).not.toContain("<table");
    expect(html).toContain("<p");
  });
});
