import { idb, STORE_FILA } from "./indexedDb";
import { novaChaveIdempotencia } from "@/nucleo/http/idempotencia";

/**
 * Fila de sincronização de operações feitas offline (§9/§10).
 * Cada item carrega uma chave de idempotência fixa (gerada na criação) para o
 * backend não duplicar o efeito ao reenviar. A resolução de conflito é
 * "servidor vence": se o envio falhar por conflito (409), o item sai da fila e o
 * rascunho local é preservado para o usuário decidir.
 */
export type TipoOperacao = "criar_atendimento" | "registrar_frequencia";

export type ItemFila = {
  id: string;
  tipo: TipoOperacao;
  payload: unknown;
  chaveIdempotencia: string;
  criadoEm: string;
  tentativas: number;
  /** Chave do rascunho associado (para apagar após sucesso). */
  rascunhoChave?: string;
};

export async function enfileirar(
  tipo: TipoOperacao,
  payload: unknown,
  rascunhoChave?: string,
): Promise<ItemFila> {
  const item: ItemFila = {
    id: novaChaveIdempotencia(),
    tipo,
    payload,
    chaveIdempotencia: novaChaveIdempotencia(),
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    rascunhoChave,
  };
  await idb.put(STORE_FILA, item.id, item);
  return item;
}

export async function listarFila(): Promise<ItemFila[]> {
  const itens = await idb.getAll<ItemFila>(STORE_FILA);
  return itens.sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : 1));
}

export async function removerDaFila(id: string): Promise<void> {
  await idb.del(STORE_FILA, id);
}

export async function registrarTentativa(item: ItemFila): Promise<void> {
  await idb.put(STORE_FILA, item.id, { ...item, tentativas: item.tentativas + 1 });
}

export async function contarPendentes(): Promise<number> {
  return (await listarFila()).length;
}
