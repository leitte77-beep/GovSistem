import { beforeEach, describe, expect, it } from "vitest";
import { _limparMemoria } from "@/nucleo/offline/indexedDb";
import {
  contarPendentes,
  enfileirar,
  listarFila,
  removerDaFila,
} from "@/nucleo/offline/filaSync";

describe("fila de sincronização", () => {
  beforeEach(() => _limparMemoria());

  it("enfileira operação com chave de idempotência própria", async () => {
    const item = await enfileirar("criar_atendimento", { x: 1 }, "u1|atendimento|fam1");
    expect(item.chaveIdempotencia).toBeTruthy();
    expect(item.tentativas).toBe(0);
    expect(item.rascunhoChave).toBe("u1|atendimento|fam1");
  });

  it("conta e lista pendentes em ordem de criação", async () => {
    await enfileirar("criar_atendimento", { n: 1 });
    await enfileirar("criar_atendimento", { n: 2 });
    expect(await contarPendentes()).toBe(2);
    const fila = await listarFila();
    expect((fila[0].payload as { n: number }).n).toBe(1);
  });

  it("remove item da fila", async () => {
    const item = await enfileirar("criar_atendimento", { n: 1 });
    await removerDaFila(item.id);
    expect(await contarPendentes()).toBe(0);
  });
});
