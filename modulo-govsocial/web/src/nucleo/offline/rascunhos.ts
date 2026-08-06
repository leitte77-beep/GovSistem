import { idb, STORE_RASCUNHOS } from "./indexedDb";

/**
 * Rascunhos de formulários longos (evolução, plano, parecer) — §9.
 * Indexados por usuário + tipo + registro. Recuperação automática ao reabrir.
 */
export type Rascunho<T = unknown> = {
  chave: string;
  usuarioId: string;
  tipo: string; // ex.: "atendimento"
  registroId: string; // ex.: familyId (ou "novo")
  dados: T;
  atualizadoEm: string; // ISO
};

export function chaveRascunho(usuarioId: string, tipo: string, registroId: string): string {
  return `${usuarioId}|${tipo}|${registroId}`;
}

export async function salvarRascunho<T>(
  usuarioId: string,
  tipo: string,
  registroId: string,
  dados: T,
): Promise<string> {
  const atualizadoEm = new Date().toISOString();
  const rascunho: Rascunho<T> = {
    chave: chaveRascunho(usuarioId, tipo, registroId),
    usuarioId,
    tipo,
    registroId,
    dados,
    atualizadoEm,
  };
  await idb.put(STORE_RASCUNHOS, rascunho.chave, rascunho);
  return atualizadoEm;
}

export async function lerRascunho<T>(
  usuarioId: string,
  tipo: string,
  registroId: string,
): Promise<Rascunho<T> | undefined> {
  return idb.get<Rascunho<T>>(STORE_RASCUNHOS, chaveRascunho(usuarioId, tipo, registroId));
}

export async function apagarRascunho(
  usuarioId: string,
  tipo: string,
  registroId: string,
): Promise<void> {
  await idb.del(STORE_RASCUNHOS, chaveRascunho(usuarioId, tipo, registroId));
}
