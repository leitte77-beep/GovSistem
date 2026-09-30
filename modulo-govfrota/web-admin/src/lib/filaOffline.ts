/**
 * Fila de abastecimentos feitos sem internet (app do motorista).
 *
 * O registro fica no próprio celular (IndexedDB, com as fotos) e é enviado
 * quando a conexão volta. Cada item leva a `idempotency_key` gerada no momento
 * do registro — reenviar o mesmo item nunca duplica o abastecimento — e a hora
 * em que o motorista confirmou (`data_abastecimento`), não a hora do envio.
 */

import { AuthError, driverApi } from "@/lib/api";

const DB_NOME = "govfrota-motorista";
const STORE = "abastecimentos-pendentes";

export interface AbastecimentoPendente {
  idempotency_key: string;
  /** Hora da confirmação no celular (ISO). */
  registrado_em: string;
  dados: Record<string, unknown>;
  foto_bomba?: Blob | null;
  foto_painel?: Blob | null;
  /** Resumo para exibir na tela enquanto não é enviado. */
  resumo: { placa: string; litros: string; local: string | null };
  /** Recusado pelo servidor (ex.: KM inválido): não é reenviado sozinho. */
  erro?: string | null;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Armazenamento local indisponível neste navegador."));
      return;
    }
    const req = indexedDB.open(DB_NOME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "idempotency_key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export function guardarPendente(item: AbastecimentoPendente): Promise<IDBValidKey> {
  return operar("readwrite", (s) => s.put(item));
}

export async function listarPendentes(): Promise<AbastecimentoPendente[]> {
  try {
    const itens = await operar<AbastecimentoPendente[]>("readonly", (s) => s.getAll());
    return itens.sort((a, b) => a.registrado_em.localeCompare(b.registrado_em));
  } catch {
    return [];
  }
}

export function descartarPendente(chave: string): Promise<undefined> {
  return operar("readwrite", (s) => s.delete(chave));
}

/** Falha de rede (sem sinal, servidor fora) — diferente de recusa do servidor. */
export function ehFalhaDeRede(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}

async function enviarFoto(foto: Blob | null | undefined, nome: string): Promise<string | null> {
  if (!foto) return null;
  const arquivo = foto instanceof File ? foto : new File([foto], nome, { type: foto.type || "image/jpeg" });
  return driverApi.uploadFoto(arquivo);
}

/** Envia um abastecimento (fotos + registro). Lança o erro original em caso de falha. */
export async function enviarAbastecimento(item: AbastecimentoPendente): Promise<void> {
  const [bomba, painel] = await Promise.all([
    enviarFoto(item.foto_bomba, "bomba.jpg"),
    enviarFoto(item.foto_painel, "painel.jpg"),
  ]);
  await driverApi.abastecer({
    ...item.dados,
    ...(bomba ? { foto_bomba_url: bomba } : {}),
    ...(painel ? { foto_painel_url: painel } : {}),
    data_abastecimento: item.registrado_em,
    idempotency_key: item.idempotency_key,
  });
}

let sincronizando: Promise<{ enviados: number; recusados: number }> | null = null;

/**
 * Tenta enviar tudo que está na fila. Para no primeiro sinal de rede ruim;
 * recusas do servidor ficam marcadas com o motivo para o motorista ver.
 */
export function sincronizarPendentes(): Promise<{ enviados: number; recusados: number }> {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    let enviados = 0;
    let recusados = 0;
    for (const item of await listarPendentes()) {
      if (item.erro) continue;
      try {
        await enviarAbastecimento(item);
        await descartarPendente(item.idempotency_key);
        enviados += 1;
      } catch (e) {
        if (e instanceof AuthError || ehFalhaDeRede(e)) break;
        await guardarPendente({ ...item, erro: (e as Error).message || "Recusado pelo servidor." });
        recusados += 1;
      }
    }
    return { enviados, recusados };
  })().finally(() => {
    sincronizando = null;
  });
  return sincronizando;
}

// ── Cache dos dados de referência (veículos, locais) para abrir sem internet ──

const PREFIXO_CACHE = "govfrota_motorista_cache:";

export function salvarCache(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIXO_CACHE + chave, JSON.stringify(valor));
  } catch {
    // Sem armazenamento local: o app só funciona online.
  }
}

export function lerCache<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(PREFIXO_CACHE + chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}
