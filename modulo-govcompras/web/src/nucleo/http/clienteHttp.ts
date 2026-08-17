import { obterToken, limparToken } from "@/nucleo/auth/tokenStorage";
import { ErroApi } from "./erroApi";

const BASE_URL = "/api/govcompras/v1";

let aoDeslogar: (() => void) | null = null;

export function registrarAoDeslogar(callback: () => void): void {
  aoDeslogar = callback;
}

interface OpcoesRequisicao {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function montarUrl(caminho: string, query?: OpcoesRequisicao["query"]): string {
  const url = new URL(BASE_URL + caminho, window.location.origin);
  if (query) {
    for (const [chave, valor] of Object.entries(query)) {
      if (valor !== undefined && valor !== null && valor !== "") {
        url.searchParams.set(chave, String(valor));
      }
    }
  }
  return url.pathname + url.search;
}

async function requisitar<T>(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
  const token = obterToken();
  const resposta = await fetch(montarUrl(caminho, opcoes.query), {
    method: opcoes.method ?? "GET",
    headers: {
      ...(opcoes.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
  });

  if (resposta.status === 204) {
    return undefined as T;
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    if (resposta.status === 401) {
      limparToken();
      aoDeslogar?.();
    }
    throw new ErroApi(
      dados?.mensagem ?? "Não foi possível concluir a operação.",
      dados?.erro ?? "erro_desconhecido",
      resposta.status,
      dados?.campos ?? [],
      dados?.pendencias,
    );
  }

  return dados as T;
}

export const api = {
  get: <T>(caminho: string, query?: OpcoesRequisicao["query"]) =>
    requisitar<T>(caminho, { method: "GET", query }),
  post: <T>(caminho: string, body?: unknown, query?: OpcoesRequisicao["query"]) =>
    requisitar<T>(caminho, { method: "POST", body, query }),
  put: <T>(caminho: string, body?: unknown) => requisitar<T>(caminho, { method: "PUT", body }),
  patch: <T>(caminho: string, body?: unknown) => requisitar<T>(caminho, { method: "PATCH", body }),
  del: <T>(caminho: string) => requisitar<T>(caminho, { method: "DELETE" }),
};
