import type {
  RmaAjusteOut,
  RmaDrillDown,
  RmaFechamentoListItem,
  RmaFechamentoOut,
  RmaStatus,
} from "@/tipos/rma";
import { FAMILIA } from "./novaEsperanca";

/**
 * Store dinâmico do RMA (Fase 8, §4.8).
 * Usa o shape REAL do backend (dicionário-de-dicionários por bloco: CRAS_A,
 * CRAS_C, CRAS_D + _metadata), para exercitar o normalizarBlocos com o formato
 * de produção. Semeia um fechamento EM_CONFERENCIA para CRAS Norte / junho de
 * 2026 com um ajuste em C4 (duplicidade), como no plano.
 */

type Fechamento = RmaFechamentoOut;
type AjusteInterno = RmaAjusteOut & { fechamento_id: string };

const SEED_UNIT = "u-cras-norte";
const SEED_ANO = 2026;
const SEED_MES = 6;
const SEED_ID = "rma-cras-norte-2026-06";

function metadata(unitTipo: string, ano: number, mes: number) {
  return {
    calculado_em: new Date("2026-07-01T08:00:00Z").toISOString(),
    unidade_tipo: unitTipo,
    periodo: `${ano}-${String(mes).padStart(2, "0")}`,
  };
}

/** Gera dados calculados determinísticos para uma competência. */
function calcularDados(unitId: string, ano: number, mes: number) {
  // Variação leve por mês para a série ficar plausível (sem aleatoriedade).
  const base = ((mes * 7) % 11) + 1;
  if (unitId === "u-creas") {
    return {
      CREAS_A: {
        A1_casos_acompanhamento_paefi: 40 + base,
        A2_novos_casos_mes: 5 + (base % 4),
        A3_mse_em_cumprimento: 9 + (base % 3),
      },
      CREAS_C: { C1_total_familias_atendidas: 70 + base * 2 },
      _metadata: metadata("CREAS", ano, mes),
    } as Record<string, unknown>;
  }
  return {
    CRAS_A: {
      A1_familias_acompanhamento: 90 + base,
      A2_familias_novas_mes: 10 + (base % 5),
      A4_beneficiarias_pbf: 68 + base,
      A5_membros_bpc: 6 + (base % 3),
    },
    CRAS_C: {
      C1_total_familias_atendidas: 120 + base,
      C2_enc_cadunico_inclusao: 12 + (base % 5),
      C4_enc_bpc: 6,
      C5_enc_creas: 2 + (base % 3),
      C6_visitas_domiciliares: 18 + base,
    },
    CRAS_D: {
      D1_participantes_scfv: 42 + base,
      D2_grupos_scfv_ativos: 3,
    },
    _metadata: metadata("CRAS", ano, mes),
  } as Record<string, unknown>;
}

let fechamentos: Fechamento[] = [];
let ajustes: AjusteInterno[] = [];
let seq = 1;

function novoId(prefixo: string): string {
  return `${prefixo}-${(seq++).toString(36)}-${Date.now().toString(36)}`;
}

export function resetarRma() {
  seq = 1;
  const seedDados = calcularDados(SEED_UNIT, SEED_ANO, SEED_MES);
  // Aplica o ajuste de C4 (6 → 5) já nos dados calculados.
  (seedDados.CRAS_C as Record<string, number>).C4_enc_bpc = 5;

  fechamentos = [
    {
      id: SEED_ID,
      unit_id: SEED_UNIT,
      ano: SEED_ANO,
      mes: SEED_MES,
      status: "EM_CONFERENCIA",
      fechado_por_id: null,
      fechado_em: null,
      reaberto_por_id: null,
      reaberto_em: null,
      motivo_reabertura: null,
      dados_calculados: seedDados,
      calculado_em: new Date("2026-07-01T08:00:00Z").toISOString(),
      ajustes: [],
      created_at: new Date("2026-07-01T08:00:00Z").toISOString(),
      updated_at: new Date("2026-07-02T09:00:00Z").toISOString(),
    },
  ];
  ajustes = [
    {
      fechamento_id: SEED_ID,
      id: "rma-ajuste-c4",
      bloco: "CRAS_C",
      campo: "C4_enc_bpc",
      valor_calculado: 6,
      valor_ajustado: 5,
      justificativa: "Duplicidade identificada no registro de origem.",
      ajustado_por_id: "user-coord",
      created_at: new Date("2026-07-02T09:00:00Z").toISOString(),
    },
  ];
}
resetarRma();

function comAjustes(f: Fechamento): Fechamento {
  const doFechamento = ajustes
    .filter((a) => a.fechamento_id === f.id)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ fechamento_id, ...resto }) => resto);
  return { ...f, ajustes: doFechamento };
}

export function listarFechamentos(params: {
  unit_id?: string;
  ano?: number;
  status?: string;
}): RmaFechamentoListItem[] {
  return fechamentos
    .filter((f) => !params.unit_id || f.unit_id === params.unit_id)
    .filter((f) => !params.ano || f.ano === params.ano)
    .filter((f) => !params.status || f.status === params.status)
    .sort((a, b) => (a.ano !== b.ano ? b.ano - a.ano : b.mes - a.mes))
    .map((f) => ({
      id: f.id,
      unit_id: f.unit_id,
      ano: f.ano,
      mes: f.mes,
      status: f.status,
      calculado_em: f.calculado_em,
      fechado_em: f.fechado_em,
    }));
}

/** Calcula ou devolve o existente (idempotente). */
export function calcularOuObter(
  unitId: string,
  ano: number,
  mes: number,
): Fechamento {
  const existente = fechamentos.find(
    (f) => f.unit_id === unitId && f.ano === ano && f.mes === mes,
  );
  if (existente && existente.dados_calculados) return comAjustes(existente);

  const agora = new Date().toISOString();
  const novo: Fechamento = {
    id: novoId("rma"),
    unit_id: unitId,
    ano,
    mes,
    status: "EM_CONFERENCIA",
    fechado_por_id: null,
    fechado_em: null,
    reaberto_por_id: null,
    reaberto_em: null,
    motivo_reabertura: null,
    dados_calculados: calcularDados(unitId, ano, mes),
    calculado_em: agora,
    ajustes: [],
    created_at: agora,
    updated_at: agora,
  };
  fechamentos.push(novo);
  return comAjustes(novo);
}

export function obterFechamento(id: string): Fechamento | undefined {
  const f = fechamentos.find((x) => x.id === id);
  return f ? comAjustes(f) : undefined;
}

/** Retorna "FECHADO" quando já fechado (o handler traduz para 422). */
export function ajustarFechamento(
  id: string,
  corpo: {
    bloco: string;
    campo: string;
    valor_calculado: number;
    valor_ajustado: number;
    justificativa: string;
  },
): RmaAjusteOut | "FECHADO" | null {
  const f = fechamentos.find((x) => x.id === id);
  if (!f) return null;
  if (f.status === "FECHADO") return "FECHADO";

  // Atualiza o valor nos dados calculados (dicionário-de-dicionários).
  if (f.dados_calculados && corpo.bloco in f.dados_calculados) {
    const bloco = f.dados_calculados[corpo.bloco] as Record<string, number>;
    bloco[corpo.campo] = corpo.valor_ajustado;
  }

  const a: AjusteInterno = {
    fechamento_id: id,
    id: novoId("aj"),
    bloco: corpo.bloco,
    campo: corpo.campo,
    valor_calculado: corpo.valor_calculado,
    valor_ajustado: corpo.valor_ajustado,
    justificativa: corpo.justificativa,
    ajustado_por_id: "user-coord",
    created_at: new Date().toISOString(),
  };
  ajustes.push(a);
  f.updated_at = a.created_at;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fechamento_id, ...saida } = a;
  return saida;
}

export function fecharFechamento(id: string): Fechamento | "FECHADO" | null {
  const f = fechamentos.find((x) => x.id === id);
  if (!f) return null;
  if (f.status === "FECHADO") return "FECHADO";
  f.status = "FECHADO" as RmaStatus;
  f.fechado_por_id = "user-gestor";
  f.fechado_em = new Date().toISOString();
  f.updated_at = f.fechado_em;
  return comAjustes(f);
}

export function reabrirFechamento(
  id: string,
  motivo: string,
): Fechamento | "NAO_FECHADO" | null {
  const f = fechamentos.find((x) => x.id === id);
  if (!f) return null;
  if (f.status !== "FECHADO") return "NAO_FECHADO";
  f.status = "REABERTO" as RmaStatus;
  f.reaberto_por_id = "user-gestor";
  f.reaberto_em = new Date().toISOString();
  f.motivo_reabertura = motivo;
  f.updated_at = f.reaberto_em;
  return comAjustes(f);
}

/** Drill-down: lista de referências que compõem o número (sem PII). */
export function drillDown(
  id: string,
  bloco: string,
  campo: string,
): RmaDrillDown | null {
  const f = fechamentos.find((x) => x.id === id);
  if (!f || !f.dados_calculados) return null;
  const blocoDados = f.dados_calculados[bloco] as Record<string, number> | undefined;
  const valor = blocoDados ? Number(blocoDados[campo]) || 0 : 0;

  const registros = Array.from({ length: Math.min(valor, 8) }).map((_, i) => ({
    referencia: `Família nº ${FAMILIA.codigo + i}`,
    descricao: `${FAMILIA.territorio}`,
    data: new Date(f.ano, f.mes - 1, ((i * 3) % 27) + 1).toISOString().slice(0, 10),
    href: `/familias/${FAMILIA.id}`,
  }));

  return { bloco, campo, valor, registros };
}

/** Exporta os dados calculados como CSV (Bloco;Campo;Valor). */
export function exportarCsv(id: string): string | null {
  const f = fechamentos.find((x) => x.id === id);
  if (!f || !f.dados_calculados) return null;
  const linhas = ["Bloco;Campo;Valor"];
  for (const [blocoNome, campos] of Object.entries(f.dados_calculados)) {
    if (blocoNome.startsWith("_")) continue;
    if (Array.isArray(campos)) {
      for (const c of campos) linhas.push(`${blocoNome};${c.campo};${c.valor}`);
    } else if (campos && typeof campos === "object") {
      for (const [campo, valor] of Object.entries(campos as Record<string, number>)) {
        linhas.push(`${blocoNome};${campo};${valor}`);
      }
    }
  }
  return linhas.join("\n");
}
