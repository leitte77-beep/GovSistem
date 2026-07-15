/**
 * Wrapper mínimo de IndexedDB (sem dependência externa) para:
 * - rascunhos de formulários longos (evolução) por usuário+registro (§9);
 * - fila de sincronização de operações feitas offline (§9/§10).
 *
 * IMPORTANTE (LGPD/§1.2): rascunhos podem conter texto de evolução (sensível).
 * Eles vivem só no dispositivo do usuário, indexados por usuário, e são
 * REMOVIDOS após o envio bem-sucedido. Nunca vão para servidores de terceiros
 * nem para o query-cache. Em ambiente sem IndexedDB (teste/SSR), cai num
 * armazenamento em memória para não quebrar.
 */

const DB_NOME = "govsocial";
const DB_VERSAO = 1;
export const STORE_RASCUNHOS = "rascunhos";
export const STORE_FILA = "fila_sync";

let dbPromise: Promise<IDBDatabase> | null = null;

function temIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function abrir(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RASCUNHOS)) {
        db.createObjectStore(STORE_RASCUNHOS, { keyPath: "chave" });
      }
      if (!db.objectStoreNames.contains(STORE_FILA)) {
        db.createObjectStore(STORE_FILA, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// ── Fallback em memória (jsdom/SSR) ──────────────────────────────────
const memoria: Record<string, Map<string, unknown>> = {
  [STORE_RASCUNHOS]: new Map(),
  [STORE_FILA]: new Map(),
};

async function put<T>(store: string, chave: string, valor: T): Promise<void> {
  if (!temIndexedDB()) {
    memoria[store].set(chave, valor);
    return;
  }
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(valor as object);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get<T>(store: string, chave: string): Promise<T | undefined> {
  if (!temIndexedDB()) return memoria[store].get(chave) as T | undefined;
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(chave);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function getAll<T>(store: string): Promise<T[]> {
  if (!temIndexedDB()) return [...memoria[store].values()] as T[];
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function del(store: string, chave: string): Promise<void> {
  if (!temIndexedDB()) {
    memoria[store].delete(chave);
    return;
  }
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(chave);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const idb = { put, get, getAll, del };

/** Só para testes: limpa o fallback em memória. */
export function _limparMemoria() {
  memoria[STORE_RASCUNHOS].clear();
  memoria[STORE_FILA].clear();
}
