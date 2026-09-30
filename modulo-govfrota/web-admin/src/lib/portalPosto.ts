/** Cliente do portal do posto — token próprio, separado da Prefeitura e do motorista. */

const BASE = "/api/govfrota/portal-posto";
export const POSTO_TOKEN_KEY = "govfrota_posto_token";

export class SessaoPostoExpirada extends Error {}

function token(): string | null {
  try {
    return localStorage.getItem(POSTO_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function salvarToken(t: string) {
  try {
    localStorage.setItem(POSTO_TOKEN_KEY, t);
  } catch {
    /* navegação privada: a sessão vale só nesta aba */
  }
}

export function sair() {
  try {
    localStorage.removeItem(POSTO_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token();
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) || {}) };
  if (!(init.body instanceof FormData) && init.body) headers["Content-Type"] = "application/json";
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    sair();
    throw new SessaoPostoExpirada("Sessão encerrada. Entre novamente.");
  }
  if (!res.ok) {
    let msg = "Não foi possível concluir a operação.";
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* resposta sem JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const qs = (p: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : "";
};

export interface MePosto {
  nome: string;
  login: string;
  deve_trocar_senha: boolean;
  posto: string;
  posto_cnpj: string | null;
  prefeitura: string | null;
}

export interface PainelPosto {
  periodo: { inicio: string; fim: string };
  abastecimentos: number;
  litros: number;
  valor: number;
  diario: { dia: string; litros: number; valor: number }[];
  por_secretaria: { secretaria: string; abastecimentos: number; valor: number }[];
  notas: { pendentes: number; valor_pendente: number; enviadas_no_periodo: number; com_aviso: number };
}

export interface NotaResumo {
  numero: string | null;
  serie: string | null;
  chave: string | null;
  valor: number | null;
  emissao: string | null;
  enviada_em: string | null;
  xml_id: string | null;
  pdf_id: string | null;
  avisos: string[];
}

export interface AbastecimentoPosto {
  id: string;
  data: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  motorista: string | null;
  combustivel: string;
  secretaria: string | null;
  litros: number;
  preco_litro: number | null;
  valor: number | null;
  nota: NotaResumo | null;
}

async function baixarArquivo(url: string, nome: string, auth: string | null) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${auth ?? ""}` } });
  if (!res.ok) throw new Error("Não foi possível baixar o arquivo.");
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

export const portal = {
  login: (login: string, senha: string) =>
    req<{ access_token: string; deve_trocar_senha: boolean }>("/login", { method: "POST", body: JSON.stringify({ login, senha }) }),
  trocarSenha: (senha_atual: string, nova_senha: string) =>
    req<{ access_token: string }>("/trocar-senha", { method: "POST", body: JSON.stringify({ senha_atual, nova_senha }) }),
  me: () => req<MePosto>("/me"),
  painel: (inicio?: string, fim?: string) => req<PainelPosto>(`/painel${qs({ inicio, fim })}`),
  secretarias: () => req<{ id: string; nome: string }[]>("/secretarias"),
  /** nota: PENDENTE (todo o histórico sem nota) | ENVIADA */
  abastecimentos: (p: { inicio?: string; fim?: string; unidade_id?: string; nota?: string }) =>
    req<AbastecimentoPosto[]>(`/abastecimentos${qs(p)}`),
  enviarNota: (id: string, arquivos: File[]) => {
    const fd = new FormData();
    arquivos.forEach((f) => fd.append("arquivos", f));
    return req<NotaResumo>(`/abastecimentos/${id}/nota`, { method: "POST", body: fd });
  },
  baixarNota: (abastId: string, notaId: string, nome: string) =>
    baixarArquivo(`${BASE}/abastecimentos/${abastId}/nota/${notaId}/arquivo`, nome, token()),
};

export const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const litros = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`;
export const dataBr = (d: string) => new Date(d.length === 10 ? d + "T12:00" : d).toLocaleDateString("pt-BR");
export const dataHora = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** "ÓLEO DIESEL S500" → "Óleo Diesel S500" (siglas com dígito ficam como estão). */
export const nomeProprio = (t: string | null | undefined) =>
  (t ?? "").toLowerCase().replace(/(^|[\s/(-])([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b([a-z]\d+)\b/gi, (m) => m.toUpperCase());

export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type Atalho = "hoje" | "7d" | "mes" | "mesPassado";
export function periodoDe(tipo: Atalho): [string, string] {
  const h = new Date();
  if (tipo === "hoje") return [isoLocal(h), isoLocal(h)];
  if (tipo === "7d") return [isoLocal(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 6)), isoLocal(h)];
  if (tipo === "mes") return [isoLocal(new Date(h.getFullYear(), h.getMonth(), 1)), isoLocal(h)];
  return [isoLocal(new Date(h.getFullYear(), h.getMonth() - 1, 1)), isoLocal(new Date(h.getFullYear(), h.getMonth(), 0))];
}

/** Período escolhido fica lembrado entre as telas do portal (só nesta aba). */
const CHAVE_PERIODO = "govfrota_posto_periodo";
export function periodoLembrado(): [string, string] {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE_PERIODO) ?? "null");
    if (Array.isArray(v) && v.length === 2) return v as [string, string];
  } catch {
    /* sem storage */
  }
  return periodoDe("mes");
}
export function lembrarPeriodo(p: [string, string]) {
  try {
    sessionStorage.setItem(CHAVE_PERIODO, JSON.stringify(p));
  } catch {
    /* sem storage */
  }
}

/** Baixa uma planilha CSV (separador ; e BOM, abre direto no Excel). */
export function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number | null | undefined)[][]) {
  const cel = (v: string | number | null | undefined) => {
    const t = typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : (v ?? "");
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = "\uFEFF" + [cabecalho, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
