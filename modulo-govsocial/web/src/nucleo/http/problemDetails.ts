import type { ProblemDetails } from "@/tipos/api";

export class ErroApi extends Error {
  problema: ProblemDetails;
  offline: boolean;
  constructor(problema: ProblemDetails, offline?: boolean) { super(""); this.problema = problema; this.offline = offline ?? false; }
}

/** Problema padronizado para falha de rede/offline (RFC 9457 → pt-BR). */
export function problemaOffline() {
  return {
    type: "about:blank",
    title: "Sem conexão",
    status: 0,
    detail: "Não foi possível contatar o servidor. Verifique sua conexão e tente novamente.",
  };
}

const MAPA_POR_TYPE: Record<string, string> = {
  "urn:govsocial:beneficio:duplicidade":
    "Já existe uma concessão recente deste benefício para esta família (janela mínima).",
};

const MAPA_POR_STATUS: Record<number, string> = {
  0: "Dispositivo sem conexão com o servidor. Verifique sua internet e tente novamente.",
  400: "A solicitação é inválida. Revise os dados e tente novamente.",
  401: "Sua sessão expirou ou não é válida. Entre novamente na plataforma.",
  403: "Você não tem permissão para esta ação.",
  404: "O registro não foi encontrado ou não existe mais.",
  409: "Conflito com um registro existente. Verifique os dados e tente novamente.",
  422: "Os dados enviados não passaram na validação. Revise os campos destacados.",
  500: "Ocorreu um erro inesperado no servidor. Tente novamente em instantes.",
  503: "O serviço está temporariamente indisponível. Tente novamente em instantes.",
};

/**
 * Traduz um Problem Details (RFC 9457) para mensagem amigável em pt-BR.
 * Ordem: type conhecido → detail do backend (quando não há mapa) → status.
 * Nunca expõe stack trace nem dado pessoal.
 */
export function mensagemAmigavel(problema: ProblemDetails): string {
  if (!problema) return "Ocorreu um erro inesperado.";
  const porType = MAPA_POR_TYPE[problema.type ?? ""];
  if (porType) return porType;
  const porStatus = MAPA_POR_STATUS[problema.status];
  if (!porStatus && problema.detail) return problema.detail;
  return porStatus ?? "Ocorreu um erro inesperado.";
}

/** Mapeia `errors[]` (RFC 9457) para `{ campo: mensagem }` — para ligar ao campo do formulário. */
export function errosDeCampo(problema: ProblemDetails): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const e of problema?.errors ?? []) {
    if (e.field) mapa[e.field] = e.message;
  }
  return mapa;
}
