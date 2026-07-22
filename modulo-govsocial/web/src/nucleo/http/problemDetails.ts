import type { ProblemDetails } from "@/tipos/api";

/**
 * Mapa `type` (RFC 9457) → mensagem pt-BR amigável. O backend usa
 * `type: "about:blank"` por padrão hoje, então a tradução principal cai no
 * status HTTP; deixamos o mapa por `type` pronto para quando o backend passar a
 * emitir URIs de problema específicos.
 */
const POR_TIPO: Record<string, string> = {
  "urn:govsocial:beneficio:duplicidade":
    "Já existe uma concessão recente deste benefício para a família. Verifique o histórico na rede.",
  "urn:govsocial:rma:fechado":
    "Este RMA já está fechado. Solicite a reabertura à coordenação para editar.",
  "urn:govsocial:sigilo:sem-acesso":
    "Você não tem permissão para ver este conteúdo restrito nesta unidade.",
};

const POR_STATUS: Record<number, string> = {
  400: "Não foi possível concluir: revise os dados enviados.",
  401: "Sua sessão expirou. Entre novamente para continuar.",
  403: "Você não tem permissão para esta ação.",
  404: "Não encontramos este registro.",
  409: "Há um conflito com o estado atual do registro. Recarregue e tente de novo.",
  422: "Alguns campos precisam de correção.",
  429: "Muitas requisições em sequência. Aguarde alguns segundos e tente novamente.",
  500: "Ocorreu um erro no servidor. Tente novamente em instantes.",
  503: "O serviço está temporariamente indisponível. Tente novamente em instantes.",
};

const GENERICA = "Algo não saiu como esperado. Tente novamente.";

/** Erro tipado que carrega o Problem Details original para a UI. */
export class ErroApi extends Error {
  readonly problema: ProblemDetails;
  readonly offline: boolean;

  constructor(problema: ProblemDetails, offline = false) {
    super(mensagemAmigavel(problema));
    this.name = "ErroApi";
    this.problema = problema;
    this.offline = offline;
  }
}

/** Type guard para ErroApi. Use ao invés de `(error as ErroApi).problema`. */
export function isErroApi(erro: unknown): erro is ErroApi {
  return erro instanceof Error && erro.name === "ErroApi";
}

/** Extrai ProblemDetails seguro, com fallback para erros desconhecidos. */
export function extrairProblema(erro: unknown): ProblemDetails {
  if (isErroApi(erro)) return erro.problema;
  if (erro instanceof Error) {
    return { type: "about:blank", title: erro.message, status: 0 };
  }
  return { type: "about:blank", title: "Erro inesperado", status: 0 };
}

/** Deriva a mensagem exibível. Nunca inclui dado pessoal (§1.4). */
export function mensagemAmigavel(problema: ProblemDetails): string {
  if (problema.type && POR_TIPO[problema.type]) return POR_TIPO[problema.type];
  if (problema.status && POR_STATUS[problema.status]) return POR_STATUS[problema.status];
  // `detail` do backend já é pt-BR e sanitizado; usa como reforço.
  return problema.detail || problema.title || GENERICA;
}

/** Erros de campo (422) prontos para React Hook Form / mensagens inline. */
export function errosDeCampo(problema: ProblemDetails): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const e of problema.errors ?? []) {
    if (e.field) saida[e.field] = e.message;
  }
  return saida;
}

export function problemaOffline(): ProblemDetails {
  return {
    type: "urn:govsocial:rede:offline",
    title: "Sem conexão",
    status: 0,
    detail: "Você está sem conexão. Verifique a rede e tente novamente.",
  };
}
