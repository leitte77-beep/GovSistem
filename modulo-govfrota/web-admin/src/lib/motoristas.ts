// Utilidades da área de Motoristas: máscaras pt-BR, situação de CNH e categorias.

export const CATEGORIAS_CNH = ["A", "B", "AB", "C", "D", "E", "ACC"];

export type SituacaoCnh =
  | "VENCIDA"
  | "A_VENCER_7"
  | "A_VENCER_30"
  | "A_VENCER_60"
  | "VALIDA"
  | null;

export interface SituacaoCnhInfo {
  rotulo: string;
  classe: string;
}

export function situacaoCnh(validade: string | null, diasRestantes?: number): SituacaoCnh {
  if (!validade) return null;
  let dias = diasRestantes;
  if (dias === undefined) {
    const alvo = new Date(validade.length === 10 ? validade + "T12:00" : validade);
    dias = Math.ceil((alvo.getTime() - Date.now()) / 86400000);
  }
  if (dias < 0) return "VENCIDA";
  if (dias <= 7) return "A_VENCER_7";
  if (dias <= 30) return "A_VENCER_30";
  if (dias <= 60) return "A_VENCER_60";
  return "VALIDA";
}

export function situacaoCnhInfo(sit: SituacaoCnh): SituacaoCnhInfo {
  switch (sit) {
    case "VENCIDA":
      return { rotulo: "CNH vencida", classe: "bg-[#FFDAD6] text-[#BA1A1A]" };
    case "A_VENCER_7":
      return { rotulo: "Vence em até 7 dias", classe: "bg-[#FFDAD6] text-[#BA1A1A]" };
    case "A_VENCER_30":
      return { rotulo: "Vence em até 30 dias", classe: "bg-[#FFDD9A] text-[#805600]" };
    case "A_VENCER_60":
      return { rotulo: "Vence em até 60 dias", classe: "bg-[#FFDD9A] text-[#805600]" };
    case "VALIDA":
      return { rotulo: "Válida", classe: "bg-[#9DF6B3] text-[#106D34]" };
    default:
      return { rotulo: "Sem CNH", classe: "bg-gray-100 text-gray-600" };
  }
}

export function diasRestantesCnh(validade: string | null): number | null {
  if (!validade) return null;
  const alvo = new Date(validade.length === 10 ? validade + "T12:00" : validade);
  return Math.ceil((alvo.getTime() - Date.now()) / 86400000);
}

// Máscaras pt-BR
export function mascararCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export function formatarCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function formatarTelefone(tel: string): string {
  const d = tel.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const p = partes.filter(Boolean);
  if (p.length === 0) return "?";
  const prim = p[0][0] || "";
  const seg = p.length > 1 ? p[p.length - 1][0] : "";
  return (prim + seg).toUpperCase();
}
