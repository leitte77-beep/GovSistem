import { FAMILIA, RESULTADOS_BUSCA } from "./novaEsperanca";

/**
 * Fixtures e store dinâmico da Agenda & Fila do dia (Fase 7).
 * Fiel a AppointmentOut (app/schemas/agenda.py). Os agendamentos referenciam
 * pessoas do store (Maria/João) para que os nomes sejam resolvidos por
 * GET /persons/{id} — sem PII no payload da agenda.
 *
 * Cenário: um dia com 4 agendamentos no CRAS Norte cobrindo as 3 colunas do
 * kanban (Aguardando → Em atendimento → Concluído), sendo um ainda AGENDADO
 * (pré check-in) para exercitar o "check-in com um clique".
 */

const MARIA = RESULTADOS_BUSCA[0].person_id;
const JOAO = "c3e4f5a6-0000-0000-0000-000000000002";
const UNIDADE = "u-cras-norte";

type AppointmentMock = {
  id: string;
  unit_id: string;
  professional_id: string | null;
  person_id: string | null;
  family_id: string | null;
  tipo: string;
  status: string;
  data_hora_inicio: string;
  data_hora_fim: string | null;
  observacoes: string | null;
  senha: string | null;
  lembrete_enviado: boolean;
  opt_in_lembrete: boolean;
  created_at: string;
  updated_at: string;
};

/** Data de hoje com hora fixa (UTC) — mantém a agenda "do dia". */
function hojeComHora(h: number, m = 0): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function minutosAtras(n: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - n);
  return d.toISOString();
}

let agendamentos: AppointmentMock[] = [];

export function resetarAgenda() {
  agendamentos = [
    {
      id: "appt-aguardando-1",
      unit_id: UNIDADE,
      professional_id: null,
      person_id: MARIA,
      family_id: FAMILIA.id,
      tipo: "ATENDIMENTO",
      status: "AGUARDANDO",
      data_hora_inicio: hojeComHora(8, 30),
      data_hora_fim: null,
      observacoes: "Atualização do CadÚnico",
      senha: "A",
      lembrete_enviado: false,
      opt_in_lembrete: false,
      // Chegou há 40 min → espera crítica (âmbar/vermelho, sempre com texto).
      created_at: minutosAtras(40),
      updated_at: minutosAtras(40),
    },
    {
      id: "appt-agendado-1",
      unit_id: UNIDADE,
      professional_id: null,
      person_id: JOAO,
      family_id: FAMILIA.id,
      tipo: "ATENDIMENTO",
      status: "AGENDADO",
      data_hora_inicio: hojeComHora(9, 0),
      data_hora_fim: null,
      observacoes: "Orientação sobre benefício eventual",
      senha: "B",
      lembrete_enviado: false,
      opt_in_lembrete: true,
      created_at: hojeComHora(9, 0),
      updated_at: hojeComHora(9, 0),
    },
    {
      id: "appt-atendimento-1",
      unit_id: UNIDADE,
      professional_id: "prof-carla",
      person_id: MARIA,
      family_id: FAMILIA.id,
      tipo: "ATENDIMENTO",
      status: "EM_ATENDIMENTO",
      data_hora_inicio: hojeComHora(8, 0),
      data_hora_fim: null,
      observacoes: "Acolhida PAIF",
      senha: "C",
      lembrete_enviado: false,
      opt_in_lembrete: false,
      created_at: minutosAtras(15),
      updated_at: minutosAtras(10),
    },
    {
      id: "appt-concluido-1",
      unit_id: UNIDADE,
      professional_id: "prof-carla",
      person_id: JOAO,
      family_id: FAMILIA.id,
      tipo: "VISITA_DOMICILIAR",
      status: "CONCLUIDO",
      data_hora_inicio: hojeComHora(7, 30),
      data_hora_fim: hojeComHora(8, 0),
      observacoes: "Visita domiciliar de acompanhamento",
      senha: "D",
      lembrete_enviado: true,
      opt_in_lembrete: false,
      created_at: hojeComHora(7, 30),
      updated_at: hojeComHora(8, 0),
    },
  ];
}
resetarAgenda();

export function listarAgendamentos(unitId?: string): AppointmentMock[] {
  return agendamentos
    .filter((a) => !unitId || a.unit_id === unitId)
    .sort((a, b) => (a.data_hora_inicio < b.data_hora_inicio ? -1 : 1));
}

export function filaDoDia(unitId: string): AppointmentMock[] {
  return listarAgendamentos(unitId).filter((a) =>
    ["AGENDADO", "AGUARDANDO"].includes(a.status),
  );
}

export function obterAgendamento(id: string): AppointmentMock | undefined {
  return agendamentos.find((a) => a.id === id);
}

export function criarAgendamento(body: Partial<AppointmentMock> & { unit_id: string }): AppointmentMock {
  const agora = new Date().toISOString();
  const a: AppointmentMock = {
    id: `appt-${crypto.randomUUID()}`,
    unit_id: body.unit_id,
    professional_id: body.professional_id ?? null,
    person_id: body.person_id ?? null,
    family_id: body.family_id ?? null,
    tipo: body.tipo ?? "ATENDIMENTO",
    status: "AGENDADO",
    data_hora_inicio: body.data_hora_inicio ?? agora,
    data_hora_fim: body.data_hora_fim ?? null,
    observacoes: body.observacoes ?? null,
    senha: proximaSenha(body.unit_id),
    lembrete_enviado: false,
    opt_in_lembrete: body.opt_in_lembrete ?? false,
    created_at: agora,
    updated_at: agora,
  };
  agendamentos.push(a);
  return a;
}

function proximaSenha(unitId: string): string {
  const n = agendamentos.filter((a) => a.unit_id === unitId).length;
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return letras[n % letras.length];
}

export function atualizarAgendamento(
  id: string,
  changes: Partial<AppointmentMock>,
): AppointmentMock | undefined {
  const a = obterAgendamento(id);
  if (!a) return undefined;
  Object.assign(a, changes, { updated_at: new Date().toISOString() });
  return a;
}

export function chamarAgendamento(id: string, professionalId: string): AppointmentMock | undefined {
  return atualizarAgendamento(id, {
    status: "EM_ATENDIMENTO",
    professional_id: professionalId,
  });
}
