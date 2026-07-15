/**
 * DTOs do RMA (§4.8) espelhando app/schemas/rma.py.
 * `dados_calculados` é um dicionário de blocos; cada bloco pode vir como
 * dicionário `{ campo: valor }` (backend real) ou lista `{ campo, rotulo, valor }`
 * (fixture legada). O `normalizarBlocos` (rmaModelo.ts) trata ambos.
 */

export type RmaStatus = "ABERTO" | "EM_CONFERENCIA" | "FECHADO" | "REABERTO";

export type RmaAjusteOut = {
  id: string;
  bloco: string;
  campo: string;
  valor_calculado: number;
  valor_ajustado: number;
  justificativa: string;
  ajustado_por_id: string | null;
  created_at: string;
};

export type RmaAjusteCreate = {
  bloco: string;
  campo: string;
  valor_calculado: number;
  valor_ajustado: number;
  justificativa: string;
};

/** Campo de bloco no shape de dicionário (`{ campo: valor }`) ou lista. */
export type CampoCalculado = { campo: string; rotulo?: string; valor: number };
export type DadosCalculados = Record<
  string,
  Record<string, number> | CampoCalculado[] | unknown
>;

export type RmaFechamentoOut = {
  id: string;
  unit_id: string;
  ano: number;
  mes: number;
  status: RmaStatus;
  fechado_por_id: string | null;
  fechado_em: string | null;
  reaberto_por_id: string | null;
  reaberto_em: string | null;
  motivo_reabertura: string | null;
  dados_calculados: DadosCalculados | null;
  calculado_em: string | null;
  ajustes: RmaAjusteOut[];
  created_at: string;
  updated_at: string;
};

export type RmaFechamentoListItem = {
  id: string;
  unit_id: string;
  ano: number;
  mes: number;
  status: RmaStatus;
  calculado_em: string | null;
  fechado_em: string | null;
};

export type RmaReaberturaCreate = { motivo_reabertura: string };

/** Registro que compõe um número (drill-down). Sem PII: só referências. */
export type RmaDrillDownRegistro = {
  referencia: string;
  descricao: string;
  data: string | null;
  href?: string | null;
};

export type RmaDrillDown = {
  bloco: string;
  campo: string;
  valor: number;
  registros: RmaDrillDownRegistro[];
};
