import { beforeEach, describe, expect, it } from "vitest";
import { _limparMemoria } from "@/nucleo/offline/indexedDb";
import {
  apagarRascunho,
  chaveRascunho,
  lerRascunho,
  salvarRascunho,
} from "@/nucleo/offline/rascunhos";

describe("rascunhos (IndexedDB / fallback em memória)", () => {
  beforeEach(() => _limparMemoria());

  it("salva e recupera rascunho por usuário+tipo+registro", async () => {
    await salvarRascunho("u1", "atendimento", "fam1", { evolucao: "texto" });
    const r = await lerRascunho<{ evolucao: string }>("u1", "atendimento", "fam1");
    expect(r?.dados.evolucao).toBe("texto");
    expect(r?.atualizadoEm).toBeTruthy();
  });

  it("isola rascunhos entre usuários", async () => {
    await salvarRascunho("u1", "atendimento", "fam1", { v: 1 });
    const outro = await lerRascunho("u2", "atendimento", "fam1");
    expect(outro).toBeUndefined();
  });

  it("apaga o rascunho após uso", async () => {
    await salvarRascunho("u1", "atendimento", "fam1", { v: 1 });
    await apagarRascunho("u1", "atendimento", "fam1");
    expect(await lerRascunho("u1", "atendimento", "fam1")).toBeUndefined();
  });

  it("gera chave estável", () => {
    expect(chaveRascunho("u1", "atendimento", "fam1")).toBe("u1|atendimento|fam1");
  });
});
