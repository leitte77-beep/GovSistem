/**
 * Sessão do motorista no celular, inclusive sem internet.
 *
 * Depois de um login com internet guardamos, por usuário, o token e uma
 * verificação do PIN (PBKDF2 com sal — nunca o PIN). Sem sinal, quem já
 * entrou neste celular entra de novo conferindo o PIN localmente; o que for
 * registrado vai para a fila e sobe quando houver internet. Se o token tiver
 * vencido nesse meio-tempo, a primeira chamada ao servidor pede login de novo
 * e a fila continua guardada.
 */

const CREDENCIAIS = "govfrota_motorista_offline";
const MOTORISTA_ATUAL = "govfrota_motorista_id";
const DRIVER_TOKEN_KEY = "govfrota_motorista_token";
const ITERACOES = 150_000;
// Tentativas erradas seguidas sem internet antes de travar por alguns minutos.
const MAX_ERROS = 5;
const TRAVA_MS = 5 * 60_000;

interface Credencial {
  motorista_id: string;
  nome: string;
  sal: string;
  hash: string;
  token: string;
  erros?: number;
  travado_ate?: number;
}

function ler(): Record<string, Credencial> {
  try {
    return JSON.parse(localStorage.getItem(CREDENCIAIS) || "{}");
  } catch {
    return {};
  }
}

function gravar(todas: Record<string, Credencial>) {
  try {
    localStorage.setItem(CREDENCIAIS, JSON.stringify(todas));
  } catch {
    /* sem armazenamento: só login online */
  }
}

const chave = (login: string) => login.trim().toLowerCase();

function hex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function derivar(pin: string, salHex: string): Promise<string> {
  const sal = new Uint8Array(salHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: ITERACOES }, base, 256);
  return hex(bits);
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Motorista da sessão atual (dono dos itens que entram na fila). */
export function motoristaAtual(): string | null {
  try {
    return localStorage.getItem(MOTORISTA_ATUAL);
  } catch {
    return null;
  }
}

export function temSessao(): boolean {
  try {
    return !!localStorage.getItem(DRIVER_TOKEN_KEY);
  } catch {
    return false;
  }
}

/** Troca de motorista no celular: dados de referência do anterior não valem. */
function definirMotorista(id: string) {
  try {
    if (localStorage.getItem(MOTORISTA_ATUAL) !== id) {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("govfrota_motorista_cache:")) localStorage.removeItem(k);
      }
    }
    localStorage.setItem(MOTORISTA_ATUAL, id);
  } catch {
    /* ignore */
  }
}

/** Após login com internet: guarda o necessário para entrar sem sinal. */
export async function lembrarLogin(login: string, pin: string, motorista: { id: string; nome: string }, token: string) {
  definirMotorista(motorista.id);
  if (typeof crypto === "undefined" || !crypto.subtle) return;
  try {
    const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derivar(pin, sal);
    const todas = ler();
    todas[chave(login)] = { motorista_id: motorista.id, nome: motorista.nome, sal, hash, token };
    gravar(todas);
  } catch {
    /* sem WebCrypto: só login online */
  }
}

/** Este usuário já entrou com internet neste celular? */
export function podeEntrarOffline(login: string): boolean {
  return !!ler()[chave(login)];
}

/**
 * Login sem internet. Devolve o motorista ou lança erro com a mensagem
 * para a tela.
 */
export async function entrarOffline(login: string, pin: string): Promise<{ id: string; nome: string }> {
  const todas = ler();
  const c = todas[chave(login)];
  if (!c || typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Sem internet. O primeiro acesso neste celular precisa de conexão.");
  }
  if (c.travado_ate && Date.now() < c.travado_ate) {
    const min = Math.ceil((c.travado_ate - Date.now()) / 60_000);
    throw new Error(`Muitas tentativas. Aguarde ${min} min ou conecte-se à internet.`);
  }
  if (!igual(await derivar(pin, c.sal), c.hash)) {
    c.erros = (c.erros ?? 0) + 1;
    if (c.erros >= MAX_ERROS) {
      c.erros = 0;
      c.travado_ate = Date.now() + TRAVA_MS;
    }
    gravar(todas);
    const e = new Error("Usuário ou PIN inválido.");
    (e as Error & { status?: number }).status = 401;
    throw e;
  }
  c.erros = 0;
  c.travado_ate = undefined;
  gravar(todas);
  definirMotorista(c.motorista_id);
  localStorage.setItem(DRIVER_TOKEN_KEY, c.token);
  return { id: c.motorista_id, nome: c.nome };
}
