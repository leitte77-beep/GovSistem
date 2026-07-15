/**
 * Política de armazenamento do token (§segurança).
 * - access_token em sessionStorage (some ao fechar a aba, reduz janela de XSS).
 * - A shell do GovSocial injeta o token via ?token= na primeira carga; nós o
 *   movemos para sessionStorage e limpamos a URL (nenhum dado na URL — §1.4).
 * - Nunca gravamos conteúdo sensível revelado aqui (§1.2).
 * - Abas abertas com noopener (as de /imprimir) nascem com sessionStorage
 *   vazio: o token é entregue a elas por um nonce de uso único (handoff).
 */
const CHAVE_ACCESS = "govsocial.access_token";
const PREFIXO_HANDOFF = "govsocial.handoff.";
const VALIDADE_HANDOFF_MS = 30_000;

type Handoff = { token: string; expira: number };

export function lerAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(CHAVE_ACCESS);
}

export function gravarAccessToken(token: string): void {
  sessionStorage.setItem(CHAVE_ACCESS, token);
}

export function limparAccessToken(): void {
  sessionStorage.removeItem(CHAVE_ACCESS);
}

function lerHandoff(chave: string): Handoff | null {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    const dado = JSON.parse(bruto) as Handoff;
    return typeof dado?.token === "string" && typeof dado?.expira === "number"
      ? dado
      : null;
  } catch {
    return null;
  }
}

function novoNonce(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // randomUUID exige contexto seguro; fallback para ambientes antigos/HTTP
  // (máquinas de prefeitura). O nonce só precisa ser único entre abas — o
  // localStorage já é isolado por origem.
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function limparHandoffsVencidos(): void {
  const agora = Date.now();
  for (const chave of Object.keys(localStorage)) {
    if (!chave.startsWith(PREFIXO_HANDOFF)) continue;
    const dado = lerHandoff(chave);
    if (!dado || dado.expira <= agora) localStorage.removeItem(chave);
  }
}

/**
 * Guarda o token da aba atual sob um nonce de uso único e devolve o nonce, que
 * viaja na URL da aba nova. O token em si nunca entra na URL (§1.4) e o nonce
 * vale por 30s. Cada clique gera o seu, então abas de tenants diferentes nunca
 * trocam token entre si.
 */
export function criarHandoffToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = lerAccessToken();
  if (!token) return null;
  limparHandoffsVencidos();
  const nonce = novoNonce();
  localStorage.setItem(
    PREFIXO_HANDOFF + nonce,
    JSON.stringify({ token, expira: Date.now() + VALIDADE_HANDOFF_MS }),
  );
  return nonce;
}

function consumirHandoffToken(nonce: string): string | null {
  const chave = PREFIXO_HANDOFF + nonce;
  const dado = lerHandoff(chave);
  localStorage.removeItem(chave);
  if (!dado || dado.expira <= Date.now()) return null;
  return dado.token;
}

/**
 * Move o token vindo da shell (?token=) ou do handoff de impressão (?h=) para o
 * sessionStorage e remove o parâmetro da URL sem recarregar a página.
 */
export function bootstrapTokenDaShell(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const tokenUrl = params.get("token");
  const nonce = params.get("h");

  if (tokenUrl) {
    gravarAccessToken(tokenUrl);
    params.delete("token");
  } else if (nonce) {
    const token = consumirHandoffToken(nonce);
    if (token) gravarAccessToken(token);
    params.delete("h");
  } else {
    return;
  }

  const qs = params.toString();
  const nova = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
  window.history.replaceState({}, "", nova);
}
