import type { ProblemDetails } from "@/tipos/api";
import { ErroApi, problemaOffline } from "./problemDetails";
import { lerAccessToken } from "@/nucleo/auth/tokenStorage";

/**
 * Cliente HTTP único do módulo (§13).
 * - Injeta Authorization (token da shell) e Idempotency-Key quando pedido.
 * - Mapeia erros RFC 9457 → ErroApi (mensagem pt-BR).
 * - Retry apenas em métodos idempotentes (GET/HEAD) com backoff curto.
 * - Sem retry em mutações (POST/PATCH/DELETE) — evita efeito duplicado.
 */

const BASE = import.meta.env.VITE_API_URL || "/api/govsocial/v1";

type Metodo = "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "HEAD";

export type OpcoesReq = {
  metodo?: Metodo;
  corpo?: unknown;
  headers?: Record<string, string>;
  chaveIdempotencia?: string;
  sinal?: AbortSignal;
  /** Não persistir em cache (conteúdo sensível revelado — §1.2). */
  semCache?: boolean;
  /** Retorna o corpo como texto cru (ex.: CSV) em vez de JSON. */
  texto?: boolean;
};

function ehIdempotente(m: Metodo): boolean {
  return m === "GET" || m === "HEAD";
}

async function lerProblema(resp: Response): Promise<ProblemDetails> {
  try {
    const dados = await resp.json();
    if (dados && typeof dados === "object" && "status" in dados) {
      return dados as ProblemDetails;
    }
    return { type: "about:blank", title: resp.statusText, status: resp.status };
  } catch {
    return { type: "about:blank", title: resp.statusText, status: resp.status };
  }
}

async function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function requisitar<T>(
  caminho: string,
  opcoes: OpcoesReq = {},
): Promise<T> {
  const metodo = opcoes.metodo ?? "GET";
  const url = caminho.startsWith("http") ? caminho : BASE + caminho;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...opcoes.headers,
  };
  if (opcoes.corpo !== undefined) headers["Content-Type"] = "application/json";
  if (opcoes.semCache) headers["Cache-Control"] = "no-store";

  const token = lerAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // O tenant vem no token (claim organization_id); o backend resolve por lá.
  // Mutações críticas enviam a chave de idempotência (§14).
  if (opcoes.chaveIdempotencia) headers["Idempotency-Key"] = opcoes.chaveIdempotencia;

  const init: RequestInit = {
    method: metodo,
    headers,
    signal: opcoes.sinal,
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  };

  const maxTentativas = ehIdempotente(metodo) ? 3 : 1;
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const resp = await fetch(url, init);

      if (resp.status === 204) return undefined as T;

      if (!resp.ok) {
        const problema = await lerProblema(resp);
        // Retry só em erros transitórios de GET (429/5xx).
        if (
          ehIdempotente(metodo) &&
          tentativa < maxTentativas &&
          (resp.status === 429 || resp.status >= 500)
        ) {
          await esperar(250 * tentativa);
          continue;
        }
        throw new ErroApi(problema);
      }

      const texto = await resp.text();
      if (opcoes.texto) return texto as T;
      return (texto ? JSON.parse(texto) : undefined) as T;
    } catch (erro) {
      ultimoErro = erro;
      if (erro instanceof ErroApi) throw erro;
      // Falha de rede (offline). Retry apenas em idempotentes.
      const semRede = erro instanceof TypeError;
      if (semRede && ehIdempotente(metodo) && tentativa < maxTentativas) {
        await esperar(250 * tentativa);
        continue;
      }
      if (semRede) throw new ErroApi(problemaOffline(), true);
      throw erro;
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : new ErroApi(problemaOffline(), true);
}

export const http = {
  get: <T>(caminho: string, opcoes?: Omit<OpcoesReq, "metodo" | "corpo">) =>
    requisitar<T>(caminho, { ...opcoes, metodo: "GET" }),
  getTexto: (caminho: string, opcoes?: Omit<OpcoesReq, "metodo" | "corpo" | "texto">) =>
    requisitar<string>(caminho, { ...opcoes, metodo: "GET", texto: true }),
  post: <T>(caminho: string, corpo?: unknown, opcoes?: Omit<OpcoesReq, "metodo">) =>
    requisitar<T>(caminho, { ...opcoes, metodo: "POST", corpo }),
  patch: <T>(caminho: string, corpo?: unknown, opcoes?: Omit<OpcoesReq, "metodo">) =>
    requisitar<T>(caminho, { ...opcoes, metodo: "PATCH", corpo }),
  delete: <T>(caminho: string, opcoes?: Omit<OpcoesReq, "metodo" | "corpo">) =>
    requisitar<T>(caminho, { ...opcoes, metodo: "DELETE" }),
  /** Download de arquivo (CSV/PDF) via POST — retorna Blob */
  postBlob: async (caminho: string, corpo?: unknown) => {
    const token = lerAccessToken();
    const headers: Record<string, string> = {};
    if (corpo !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch(BASE + caminho, {
      method: "POST",
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    if (!resp.ok) throw new ErroApi({ type: "about:blank", title: resp.statusText, status: resp.status });
    return resp.blob();
  },
};
