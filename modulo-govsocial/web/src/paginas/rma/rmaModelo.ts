import type {
  CampoCalculado,
  DadosCalculados,
  RmaAjusteOut,
  RmaStatus,
} from "@/tipos/rma";

/**
 * Modelo puro do RMA (§4.8) — funções testáveis, sem React.
 * Normaliza os `dados_calculados` (dicionário ou lista) em blocos exibíveis,
 * deriva rótulos legíveis dos códigos do MDS e mapeia o status para o
 * <FluxoStatus>.
 */

export type CampoNormalizado = {
  /** Chave exata do backend (usada em ajuste/drill-down). */
  campo: string;
  /** Código curto (ex.: "C1", "A2") derivado da chave. */
  codigo: string;
  rotulo: string;
  valor: number;
};

export type BlocoNormalizado = {
  /** Chave exata do bloco (ex.: "CRAS_C"). */
  id: string;
  rotulo: string;
  campos: CampoNormalizado[];
};

const ROTULOS_BLOCO: Record<string, string> = {
  CRAS_A: "Bloco A — Famílias em acompanhamento (PAIF)",
  CRAS_C: "Bloco C — Atendimentos individualizados",
  CRAS_D: "Bloco D — Atendimentos coletivos e SCFV",
  CREAS_A: "Bloco A — Casos em acompanhamento (PAEFI)",
  CREAS_C: "Bloco C — Atendimentos individualizados",
  CENTRO_POP: "Centro POP",
  // Compatibilidade com a fixture legada.
  bloco2: "Bloco 2 — Atendimentos individualizados",
};

const ROTULOS_CAMPO: Record<string, string> = {
  A1_familias_acompanhamento: "Famílias em acompanhamento",
  A2_familias_novas_mes: "Famílias novas no mês",
  A3_extrema_pobreza: "Em extrema pobreza",
  A4_beneficiarias_pbf: "Beneficiárias do Bolsa Família",
  A5_membros_bpc: "Membros com BPC",
  C1_total_familias_atendidas: "Famílias atendidas",
  C2_enc_cadunico_inclusao: "Encaminhadas p/ inclusão no CadÚnico",
  C3_enc_cadunico_atualizacao: "Encaminhadas p/ atualização do CadÚnico",
  C4_enc_bpc: "Indivíduos encaminhados ao BPC",
  C5_enc_creas: "Encaminhamentos ao CREAS",
  C6_visitas_domiciliares: "Visitas domiciliares realizadas",
  D1_participantes_scfv: "Participantes do SCFV",
  D2_grupos_scfv_ativos: "Grupos de SCFV ativos",
  A1_casos_acompanhamento_paefi: "Casos em acompanhamento PAEFI",
  A2_novos_casos_mes: "Novos casos no mês",
  A3_mse_em_cumprimento: "MSE em cumprimento",
};

/** Deriva o código curto (ex.: "C1") do início da chave, se houver. */
export function derivarCodigo(campo: string): string {
  const m = /^([A-Za-z]+\d+)/.exec(campo);
  return m ? m[1] : campo;
}

/** Humaniza uma chave em snake_case quando não há rótulo conhecido. */
export function humanizarCampo(campo: string): string {
  const conhecido = ROTULOS_CAMPO[campo];
  if (conhecido) return conhecido;
  const codigo = derivarCodigo(campo);
  const resto = campo.startsWith(codigo) ? campo.slice(codigo.length) : campo;
  const texto = resto.replace(/^[_-]+/, "").replace(/[_-]+/g, " ").trim();
  if (!texto) return campo;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function rotuloBloco(id: string): string {
  return ROTULOS_BLOCO[id] ?? `Bloco ${id.replace(/_/g, " ")}`;
}

function ehListaDeCampos(valor: unknown): valor is CampoCalculado[] {
  return Array.isArray(valor);
}

/**
 * Converte `dados_calculados` (dicionário-de-dicionários do backend OU
 * dicionário-de-listas da fixture) em blocos normalizados. Ignora chaves de
 * metadados (começam com "_").
 */
export function normalizarBlocos(
  dados: DadosCalculados | null | undefined,
): BlocoNormalizado[] {
  if (!dados) return [];
  const blocos: BlocoNormalizado[] = [];

  for (const [id, valor] of Object.entries(dados)) {
    if (id.startsWith("_")) continue;
    let campos: CampoNormalizado[] = [];

    if (ehListaDeCampos(valor)) {
      campos = valor.map((c) => ({
        campo: c.campo,
        codigo: derivarCodigo(c.campo),
        rotulo: c.rotulo ?? humanizarCampo(c.campo),
        valor: Number(c.valor) || 0,
      }));
    } else if (valor && typeof valor === "object") {
      campos = Object.entries(valor as Record<string, unknown>)
        .filter(([, v]) => typeof v === "number")
        .map(([campo, v]) => ({
          campo,
          codigo: derivarCodigo(campo),
          rotulo: humanizarCampo(campo),
          valor: Number(v) || 0,
        }));
    }

    if (campos.length > 0) {
      blocos.push({ id, rotulo: rotuloBloco(id), campos });
    }
  }

  return blocos;
}

/** Índice do ajuste mais recente por bloco+campo (para exibir "ajustado"). */
export function mapaDeAjustes(
  ajustes: RmaAjusteOut[],
): Map<string, RmaAjusteOut> {
  const mapa = new Map<string, RmaAjusteOut>();
  for (const a of ajustes) {
    const chave = `${a.bloco}::${a.campo}`;
    const atual = mapa.get(chave);
    if (!atual || a.created_at > atual.created_at) mapa.set(chave, a);
  }
  return mapa;
}

export const ETAPAS_RMA = [
  { id: "calculo", rotulo: "Cálculo" },
  { id: "conferencia", rotulo: "Conferência" },
  { id: "fechado", rotulo: "Fechado" },
];

/** Mapeia o status do RMA para o índice do <FluxoStatus>. */
export function statusRmaParaFluxo(status: RmaStatus): {
  indice: number;
  fechado: boolean;
} {
  if (status === "FECHADO") return { indice: 2, fechado: true };
  // ABERTO, EM_CONFERENCIA e REABERTO ficam na etapa de conferência.
  return { indice: 1, fechado: false };
}

/** RMA editável (ajuste/fechamento) quando ainda não está fechado. */
export function podeEditarRma(status: RmaStatus): boolean {
  return status !== "FECHADO";
}

const ROTULO_STATUS: Record<RmaStatus, string> = {
  ABERTO: "Aberto",
  EM_CONFERENCIA: "Em conferência",
  FECHADO: "Fechado",
  REABERTO: "Reaberto",
};

export function rotuloStatusRma(status: RmaStatus): string {
  return ROTULO_STATUS[status] ?? status;
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function rotuloMes(mes: number): string {
  return MESES[mes - 1] ?? String(mes);
}

export function rotuloCompetencia(ano: number, mes: number): string {
  const nome = rotuloMes(mes);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${ano}`;
}
