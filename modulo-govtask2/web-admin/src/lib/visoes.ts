/**
 * Filtros da lista e visões salvas.
 *
 * As visões ficam no `localStorage`: são preferência de quem usa, não dado
 * oficial. Nada aqui é fonte de verdade — se sumirem, o sistema continua
 * inteiro; a lista volta ao filtro padrão.
 */

export type Filtros = {
  q: string;
  situacao: string;
  tipo: string;
  setor: string;
  prioridade: string;
  origem: string;
  atrasados: boolean;
  comigo: boolean;
  parados: boolean;
  abertos: boolean;
  motivo_parada: string;
  parlamentar: string;
};

export const FILTROS_VAZIOS: Filtros = {
  q: "",
  situacao: "",
  tipo: "",
  setor: "",
  prioridade: "",
  origem: "",
  atrasados: false,
  comigo: false,
  parados: false,
  abertos: false,
  motivo_parada: "",
  parlamentar: "",
};

export type VisaoSalva = {
  nome: string;
  filtros: Filtros;
};

const CHAVE = "govtask_visoes_v1";
// Padrão de "parado" até os ajustes da prefeitura carregarem.
export const DIAS_PARADO = 15;

/** Atalhos prontos, para o comum não exigir configuração. */
export const PRESETS: VisaoSalva[] = [
  { nome: "Atrasados", filtros: { ...FILTROS_VAZIOS, atrasados: true } },
  { nome: "Urgentes", filtros: { ...FILTROS_VAZIOS, prioridade: "URGENTE" } },
  { nome: "Parados", filtros: { ...FILTROS_VAZIOS, parados: true } },
  { nome: "Obras", filtros: { ...FILTROS_VAZIOS, tipo: "OBRA" } },
  { nome: "Do Prefeito", filtros: { ...FILTROS_VAZIOS, origem: "PREFEITO" } },
];

export function carregarVisoes(): VisaoSalva[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const dados = JSON.parse(bruto);
    return Array.isArray(dados) ? (dados as VisaoSalva[]) : [];
  } catch {
    return [];
  }
}

export function salvarVisoes(visoes: VisaoSalva[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE, JSON.stringify(visoes));
}

export function mesclarFiltros(base: Filtros, salvo: Partial<Filtros>): Filtros {
  return { ...FILTROS_VAZIOS, ...base, ...salvo };
}

/** Primeiro e último dia do mês de `referencia`, em ISO (yyyy-mm-dd). */
export function intervaloDoMes(referencia: Date): { de: string; ate: string } {
  const primeiro = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  const ultimo = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0);
  return { de: paraIso(primeiro), ate: paraIso(ultimo) };
}

export function paraIso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function nomeDoMes(referencia: Date): string {
  return referencia.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}
