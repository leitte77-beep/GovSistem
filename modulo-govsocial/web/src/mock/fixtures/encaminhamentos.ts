import { FAMILIA } from "./novaEsperanca";

/**
 * Fixtures e store dinâmico de encaminhamentos (Fase 7).
 * Fiel a EncaminhamentoOut (app/schemas/encaminhamento.py). A `devolutiva`
 * (contrarreferência) é sensível: só aparece no detalhe (obter por id).
 *
 * Cenário no CRAS Norte (u-cras-norte):
 * - ENVIADO externo (Saúde) há 40 dias, ainda pendente → atrasado (âmbar).
 * - ENVIADO interno ao CREAS, aguardando aceite.
 * - RECEBIDO interno vindo do CRAS Sul, PENDENTE (aparece nos "Recebidos").
 * - RECEBIDO interno já ACEITO (a devolver contrarreferência).
 */

const CRAS_NORTE = "u-cras-norte";
const CRAS_SUL = "u-cras-sul";
const CREAS = "u-creas";

type EncaminhamentoMock = {
  id: string;
  case_file_id: string | null;
  unit_id: string;
  tipo: string;
  unidade_destino_id: string | null;
  profissional_destino_id: string | null;
  data_aceite: string | null;
  data_devolutiva: string | null;
  referral_code: string | null;
  instituicao_destino: string | null;
  numero_oficio: number | null;
  profissional_origem_id: string | null;
  data_encaminhamento: string;
  motivo: string | null;
  descricao: string | null;
  status: string;
  devolutiva: string | null;
  motivo_recusa: string | null;
  oficio_gerado: boolean;
  created_at: string;
  updated_at: string;
};

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

let encaminhamentos: EncaminhamentoMock[] = [];

export function resetarEncaminhamentos() {
  encaminhamentos = [
    {
      id: "enc-enviado-externo",
      case_file_id: "cf01-paif-000000000000",
      unit_id: CRAS_NORTE,
      tipo: "EXTERNO",
      unidade_destino_id: null,
      profissional_destino_id: null,
      data_aceite: null,
      data_devolutiva: null,
      referral_code: "SAUDE",
      instituicao_destino: "UBS Vila Rica",
      numero_oficio: 12,
      profissional_origem_id: "prof-carla",
      // 40 dias sem devolutiva → atrasado (prazo 30).
      data_encaminhamento: diasAtras(40),
      motivo: "Avaliação de saúde",
      descricao: "Encaminhamento para consulta e acompanhamento na atenção básica.",
      status: "OFICIO_GERADO",
      devolutiva: null,
      motivo_recusa: null,
      oficio_gerado: true,
      created_at: diasAtras(40),
      updated_at: diasAtras(40),
    },
    {
      id: "enc-enviado-interno",
      case_file_id: "cf01-paif-000000000000",
      unit_id: CRAS_NORTE,
      tipo: "INTERNO",
      unidade_destino_id: CREAS,
      profissional_destino_id: null,
      data_aceite: null,
      data_devolutiva: null,
      referral_code: null,
      instituicao_destino: null,
      numero_oficio: null,
      profissional_origem_id: "prof-carla",
      data_encaminhamento: diasAtras(3),
      motivo: "Situação de violação de direitos",
      descricao: "Encaminhamento ao CREAS para acompanhamento PAEFI.",
      status: "PENDENTE",
      devolutiva: null,
      motivo_recusa: null,
      oficio_gerado: false,
      created_at: diasAtras(3),
      updated_at: diasAtras(3),
    },
    {
      id: "enc-recebido-pendente",
      case_file_id: null,
      unit_id: CRAS_SUL,
      tipo: "INTERNO",
      unidade_destino_id: CRAS_NORTE,
      profissional_destino_id: null,
      data_aceite: null,
      data_devolutiva: null,
      referral_code: null,
      instituicao_destino: null,
      numero_oficio: null,
      profissional_origem_id: null,
      data_encaminhamento: diasAtras(2),
      motivo: "Transferência de território",
      descricao: "Família mudou-se para a área de abrangência do CRAS Norte.",
      status: "PENDENTE",
      devolutiva: null,
      motivo_recusa: null,
      oficio_gerado: false,
      created_at: diasAtras(2),
      updated_at: diasAtras(2),
    },
    {
      id: "enc-recebido-aceito",
      case_file_id: null,
      unit_id: CRAS_SUL,
      tipo: "INTERNO",
      unidade_destino_id: CRAS_NORTE,
      profissional_destino_id: "prof-carla",
      data_aceite: diasAtras(5),
      data_devolutiva: null,
      referral_code: null,
      instituicao_destino: null,
      numero_oficio: null,
      profissional_origem_id: null,
      data_encaminhamento: diasAtras(8),
      motivo: "Inclusão em acompanhamento PAIF",
      descricao: "Encaminhamento para acompanhamento familiar continuado.",
      status: "ACEITO",
      devolutiva: null,
      motivo_recusa: null,
      oficio_gerado: false,
      created_at: diasAtras(8),
      updated_at: diasAtras(5),
    },
  ];
  void FAMILIA;
}
resetarEncaminhamentos();

// ── Leituras ──────────────────────────────────────────────────────────
type EncaminhamentoListItemMock = {
  id: string;
  case_file_id: string | null;
  unit_id: string;
  tipo: string;
  unidade_destino_id: string | null;
  referral_code: string | null;
  instituicao_destino: string | null;
  data_encaminhamento: string;
  status: string;
  numero_oficio: number | null;
};

/** Lista para o painel: `unit_id` (enviados) ou `destino_id` (recebidos). */
export function listarEncaminhamentos(params: {
  unit_id?: string;
  destino_id?: string;
  tipo?: string;
  status?: string;
}): EncaminhamentoListItemMock[] {
  return encaminhamentos
    .filter((e) => {
      if (params.unit_id && e.unit_id !== params.unit_id) return false;
      if (params.destino_id && e.unidade_destino_id !== params.destino_id) return false;
      if (params.tipo && e.tipo !== params.tipo) return false;
      if (params.status && e.status !== params.status) return false;
      return true;
    })
    .map(paraListItem)
    .sort((a, b) => (a.data_encaminhamento < b.data_encaminhamento ? 1 : -1));
}

function paraListItem(e: EncaminhamentoMock) {
  return {
    id: e.id,
    case_file_id: e.case_file_id,
    unit_id: e.unit_id,
    tipo: e.tipo,
    unidade_destino_id: e.unidade_destino_id,
    referral_code: e.referral_code,
    instituicao_destino: e.instituicao_destino,
    data_encaminhamento: e.data_encaminhamento,
    status: e.status,
    numero_oficio: e.numero_oficio,
  };
}

export function obterEncaminhamento(id: string): EncaminhamentoMock | undefined {
  return encaminhamentos.find((e) => e.id === id);
}

// ── Escritas (workflow) ─────────────────────────────────────────────────
export function aceitarEncaminhamento(id: string, profDestinoId: string | null): EncaminhamentoMock | null {
  const e = obterEncaminhamento(id);
  if (!e || e.status !== "PENDENTE") return null;
  e.status = "ACEITO";
  e.data_aceite = new Date().toISOString();
  if (profDestinoId) e.profissional_destino_id = profDestinoId;
  e.updated_at = e.data_aceite;
  return e;
}

export function recusarEncaminhamento(id: string, motivo: string): EncaminhamentoMock | null {
  const e = obterEncaminhamento(id);
  if (!e || e.status !== "PENDENTE") return null;
  e.status = "RECUSADO";
  e.motivo_recusa = motivo;
  e.updated_at = new Date().toISOString();
  return e;
}

export function devolverEncaminhamento(id: string, devolutiva: string | null): EncaminhamentoMock | null {
  const e = obterEncaminhamento(id);
  if (!e || e.status !== "ACEITO") return null;
  e.status = "DEVOLVIDO";
  e.data_devolutiva = new Date().toISOString();
  e.devolutiva = devolutiva;
  e.updated_at = e.data_devolutiva;
  return e;
}

export function cancelarEncaminhamento(id: string): EncaminhamentoMock | null {
  const e = obterEncaminhamento(id);
  if (!e || ["DEVOLVIDO", "CANCELADO"].includes(e.status)) return null;
  e.status = "CANCELADO";
  e.updated_at = new Date().toISOString();
  return e;
}

export function criarEncaminhamento(body: {
  unit_id: string;
  tipo: string;
  unidade_destino_id?: string | null;
  referral_code?: string | null;
  instituicao_destino?: string | null;
  case_file_id?: string | null;
  motivo?: string | null;
  descricao?: string | null;
}): EncaminhamentoMock {
  const agora = new Date().toISOString();
  const externo = body.tipo === "EXTERNO";
  const numero = externo
    ? Math.max(0, ...encaminhamentos.filter((e) => e.tipo === "EXTERNO").map((e) => e.numero_oficio ?? 0)) + 1
    : null;
  const e: EncaminhamentoMock = {
    id: `enc-${crypto.randomUUID()}`,
    case_file_id: body.case_file_id ?? null,
    unit_id: body.unit_id,
    tipo: body.tipo,
    unidade_destino_id: body.unidade_destino_id ?? null,
    profissional_destino_id: null,
    data_aceite: null,
    data_devolutiva: null,
    referral_code: body.referral_code ?? null,
    instituicao_destino: body.instituicao_destino ?? null,
    numero_oficio: numero,
    profissional_origem_id: "prof-carla",
    data_encaminhamento: agora,
    motivo: body.motivo ?? null,
    descricao: body.descricao ?? null,
    status: "PENDENTE",
    devolutiva: null,
    motivo_recusa: null,
    oficio_gerado: false,
    created_at: agora,
    updated_at: agora,
  };
  encaminhamentos.push(e);
  return e;
}

export function gerarOficio(id: string): EncaminhamentoMock | null {
  const e = obterEncaminhamento(id);
  if (!e || e.tipo !== "EXTERNO") return null;
  e.oficio_gerado = true;
  e.status = "OFICIO_GERADO";
  e.updated_at = new Date().toISOString();
  return e;
}
