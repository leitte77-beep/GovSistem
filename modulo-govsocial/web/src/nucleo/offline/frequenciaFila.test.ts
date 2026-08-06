import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocka os serviços de rede: a fila deve chamar servicoGrupos.registrarFrequencia
// com a chave de idempotência do item, sem tocar em rede real.
const registrarFrequencia = vi.fn();
vi.mock("@/nucleo/api/grupos", () => ({
  servicoGrupos: {
    registrarFrequencia: (...args: unknown[]) => registrarFrequencia(...args),
  },
}));
vi.mock("@/nucleo/api/atendimento", () => ({
  criarAtendimento: vi.fn(),
}));

import { _limparMemoria } from "@/nucleo/offline/indexedDb";
import { contarPendentes, enfileirar, listarFila } from "@/nucleo/offline/filaSync";
import { sincronizarFila } from "@/nucleo/offline/processarFila";
import { ErroApi } from "@/nucleo/http/problemDetails";
import type { PayloadFrequenciaFila } from "@/nucleo/offline/processarFila";

const payload: PayloadFrequenciaFila = {
  acao_id: "ac1",
  encontro_id: "enc1",
  registros: [{ inscricao_id: "i1", presente: true, justificativa: null }],
};

describe("fila offline — registrar_frequencia", () => {
  beforeEach(() => {
    _limparMemoria();
    registrarFrequencia.mockReset();
  });

  it("envia a chamada e remove o item ao sincronizar com sucesso", async () => {
    registrarFrequencia.mockResolvedValueOnce([]);
    const item = await enfileirar("registrar_frequencia", payload);
    expect(await contarPendentes()).toBe(1);

    const r = await sincronizarFila();

    expect(r.enviados).toBe(1);
    expect(await contarPendentes()).toBe(0);
    // Enviou com a chave de idempotência fixa do item (não duplica no reenvio).
    expect(registrarFrequencia).toHaveBeenCalledWith(
      "ac1",
      "enc1",
      payload.registros,
      item.chaveIdempotencia,
    );
  });

  it("mantém o item na fila quando o envio falha por rede (retém)", async () => {
    registrarFrequencia.mockRejectedValueOnce(
      new ErroApi(
        { type: "urn:govsocial:rede:offline", title: "Sem conexão", status: 0 },
        true,
      ),
    );
    await enfileirar("registrar_frequencia", payload);

    const r = await sincronizarFila();

    expect(r.enviados).toBe(0);
    expect(r.retidos).toBe(1);
    expect(await contarPendentes()).toBe(1);
    // Registrou a tentativa.
    const fila = await listarFila();
    expect(fila[0].tentativas).toBe(1);
  });

  it("descarta o item em conflito 409 (servidor vence)", async () => {
    registrarFrequencia.mockRejectedValueOnce(
      new ErroApi({ type: "about:blank", title: "Conflito", status: 409 }),
    );
    await enfileirar("registrar_frequencia", payload);

    const r = await sincronizarFila();

    expect(r.enviados).toBe(0);
    expect(await contarPendentes()).toBe(0);
  });
});
