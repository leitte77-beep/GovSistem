/**
 * Fila do que o motorista registra sem internet (app do motorista):
 * abastecimentos e, na store `envios-pendentes`, problemas e saída/chegada do
 * uso do veículo.
 *
 * O registro fica no próprio celular (IndexedDB, com as fotos) e é enviado
 * quando a conexão volta. Cada item leva a `idempotency_key` gerada no momento
 * do registro — reenviar o mesmo item nunca duplica o abastecimento — e a hora
 * em que o motorista confirmou (`data_abastecimento`), não a hora do envio.
 */

import { AuthError, driverApi, UsoVeiculo } from "@/lib/api";

const DB_NOME = "govfrota-motorista";
const STORE = "abastecimentos-pendentes";
const STORE_ENVIOS = "envios-pendentes";

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
    const req = indexedDB.open(DB_NOME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "idempotency_key" });
      }
      if (!req.result.objectStoreNames.contains(STORE_ENVIOS)) {
        req.result.createObjectStore(STORE_ENVIOS, { keyPath: "chave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function operar<T>(
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
  store: string = STORE
): Promise<T> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const req = fn(tx.objectStore(store));
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
export async function enviarAbastecimento(item: AbastecimentoPendente, offline = false): Promise<void> {
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
    // Saiu da fila: o servidor aceita e marca para revisão em vez de recusar.
    ...(offline ? { registrado_offline: true } : {}),
  });
}

// ── Problemas e uso do veículo ─────────────────────────────────────────────

export type TipoEnvio = "problema" | "uso_saida" | "uso_chegada";

export interface EnvioPendente {
  /** Chave na fila: o id do registro (problema/saída) ou "chegada:<id do uso>". */
  chave: string;
  tipo: TipoEnvio;
  /** Hora do registro no celular (ISO). */
  registrado_em: string;
  dados: Record<string, unknown>;
  /** Foto ainda não enviada (vai em `foto_url` no envio). */
  foto?: Blob | null;
  /** Texto curto para a lista de pendentes na tela inicial. */
  resumo: string;
  erro?: string | null;
}

export function novoId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Sem randomUUID (navegador antigo): UUID v4 com Math.random.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function guardarEnvio(item: EnvioPendente): Promise<IDBValidKey> {
  return operar("readwrite", (s) => s.put(item), STORE_ENVIOS);
}

export async function listarEnvios(): Promise<EnvioPendente[]> {
  try {
    const itens = await operar<EnvioPendente[]>("readonly", (s) => s.getAll(), STORE_ENVIOS);
    return itens.sort((a, b) => a.registrado_em.localeCompare(b.registrado_em));
  } catch {
    return [];
  }
}

export function descartarEnvio(chave: string): Promise<undefined> {
  return operar("readwrite", (s) => s.delete(chave), STORE_ENVIOS);
}

/**
 * Uso em aberto considerando a fila: `servidor` é a resposta da API
 * (undefined = sem sinal). Saída guardada no celular ainda conta como aberto;
 * chegada guardada já fecha.
 */
export async function usoAbertoComFila(servidor: UsoVeiculo | null | undefined): Promise<UsoVeiculo | null> {
  const pendentes = (await listarEnvios()).filter((p) => !p.erro);
  const local = lerCache<UsoVeiculo>("uso_aberto");
  let u = servidor === undefined ? local : servidor;
  if (!u && local && pendentes.some((p) => p.chave === local.id)) u = local;
  if (u && pendentes.some((p) => p.chave === `chegada:${u!.id}`)) u = null;
  salvarCache("uso_aberto", u);
  return u;
}

/** Envia um problema/saída/chegada. Lança o erro original em caso de falha. */
export async function enviarEnvio(item: EnvioPendente, offline = false): Promise<unknown> {
  const foto = await enviarFoto(item.foto, "foto.jpg");
  const dados = { ...item.dados, ...(foto ? { foto_url: foto } : {}), registrado_em: item.registrado_em };
  if (item.tipo === "problema") return driverApi.informarProblema(dados);
  if (item.tipo === "uso_saida") return driverApi.registrarSaida(dados as Parameters<typeof driverApi.registrarSaida>[0]);
  const { uso_id, ...chegada } = dados as { uso_id: string } & Parameters<typeof driverApi.registrarChegada>[1];
  return driverApi.registrarChegada(uso_id, { ...chegada, ...(offline ? { registrado_offline: true } : {}) });
}

/**
 * Tenta enviar na hora; sem sinal, guarda na fila. Devolve a resposta do
 * servidor, ou null quando ficou guardado no celular.
 */
export async function enviarOuGuardar<T>(item: EnvioPendente): Promise<T | null> {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
    return (await enviarEnvio(item)) as T;
  } catch (e) {
    if (!ehFalhaDeRede(e)) throw e;
    await guardarEnvio(item);
    return null;
  }
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
        await enviarAbastecimento(item, true);
        await descartarPendente(item.idempotency_key);
        enviados += 1;
      } catch (e) {
        if (e instanceof AuthError || ehFalhaDeRede(e)) break;
        await guardarPendente({ ...item, erro: (e as Error).message || "Recusado pelo servidor." });
        recusados += 1;
      }
    }
    // Em ordem de registro: a saída de um uso sempre vai antes da chegada.
    for (const item of await listarEnvios()) {
      if (item.erro) continue;
      try {
        await enviarEnvio(item, true);
        await descartarEnvio(item.chave);
        enviados += 1;
      } catch (e) {
        if (e instanceof AuthError || ehFalhaDeRede(e)) break;
        await guardarEnvio({ ...item, erro: (e as Error).message || "Recusado pelo servidor." });
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
