import { describe, expect, it } from "vitest";
import {
  capacidadesDe,
  itensDeMenuDe,
} from "@/nucleo/permissoes/matrizPapeis";

describe("matriz de papéis → capacidades", () => {
  it("recepção pode cadastrar família mas não lê prontuário", () => {
    const caps = capacidadesDe(["recepcao"]);
    expect(caps.has("familia.cadastrar")).toBe(true);
    expect(caps.has("prontuario.ler")).toBe(false);
    expect(caps.has("beneficio.conceder")).toBe(false);
  });

  it("técnico superior registra atendimento e concede benefício", () => {
    const caps = capacidadesDe(["tecnico_superior"]);
    expect(caps.has("atendimento.registrar")).toBe(true);
    expect(caps.has("beneficio.conceder")).toBe(true);
    expect(caps.has("rma.fechar")).toBe(false);
  });

  it("coordenador confere RMA mas não fecha; gestor fecha", () => {
    expect(capacidadesDe(["coordenador_unidade"]).has("rma.conferir")).toBe(true);
    expect(capacidadesDe(["coordenador_unidade"]).has("rma.fechar")).toBe(false);
    expect(capacidadesDe(["gestor_municipal"]).has("rma.fechar")).toBe(true);
  });

  it("conselho não tem capacidades operacionais", () => {
    expect(capacidadesDe(["conselho"]).size).toBe(0);
  });

  it("pinos identificados no mapa exigem perfil autorizado", () => {
    expect(capacidadesDe(["vigilancia"]).has("vigilancia.pinos")).toBe(false);
    expect(capacidadesDe(["gestor_municipal"]).has("vigilancia.pinos")).toBe(true);
  });
});

describe("itens de menu por perfil (§3)", () => {
  it("recepção vê apenas Início, Famílias e Agenda & Fila", () => {
    const itens = itensDeMenuDe(["recepcao"]);
    expect([...itens].sort()).toEqual(["agenda", "familias", "inicio"]);
  });

  it("gestor não vê Atendimentos (não opera prontuário) mas vê RMA e Vigilância", () => {
    const itens = itensDeMenuDe(["gestor_municipal"]);
    expect(itens.has("atendimentos")).toBe(false);
    expect(itens.has("rma")).toBe(true);
    expect(itens.has("vigilancia")).toBe(true);
  });
});
