import { describe, expect, it } from "vitest";
import {
  errosDeCampo,
  mensagemAmigavel,
  problemaOffline,
} from "@/nucleo/http/problemDetails";

describe("mensagemAmigavel (RFC 9457 → pt-BR)", () => {
  it("traduz por type quando disponível", () => {
    expect(
      mensagemAmigavel({
        type: "urn:govsocial:beneficio:duplicidade",
        title: "Conflito",
        status: 409,
      }),
    ).toContain("concessão recente");
  });

  it("cai no status quando type é genérico", () => {
    expect(
      mensagemAmigavel({ type: "about:blank", title: "Não autenticado", status: 401 }),
    ).toContain("sessão expirou");
    expect(
      mensagemAmigavel({ type: "about:blank", title: "Erro", status: 503 }),
    ).toContain("indisponível");
  });

  it("usa detail do backend como reforço quando não há mapa", () => {
    expect(
      mensagemAmigavel({
        type: "about:blank",
        title: "Erro",
        status: 418,
        detail: "Mensagem específica do backend.",
      }),
    ).toBe("Mensagem específica do backend.");
  });
});

describe("errosDeCampo", () => {
  it("mapeia errors[] para {campo: mensagem}", () => {
    const mapa = errosDeCampo({
      type: "about:blank",
      title: "Erro de validação",
      status: 422,
      errors: [
        { field: "cpf", message: "CPF inválido" },
        { field: "nome_civil", message: "Obrigatório" },
      ],
    });
    expect(mapa).toEqual({ cpf: "CPF inválido", nome_civil: "Obrigatório" });
  });
});

describe("problemaOffline", () => {
  it("gera um Problem Details de rede", () => {
    const p = problemaOffline();
    expect(p.status).toBe(0);
    expect(mensagemAmigavel(p)).toContain("sem conexão");
  });
});
