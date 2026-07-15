import { http } from "@/nucleo/http/clienteHttp";
import type {
  AppointmentCreate,
  AppointmentOut,
  AppointmentUpdate,
  VisitaOut,
} from "@/tipos/agenda";
import type { ReceptionOut } from "@/tipos/recepcao";

/**
 * Serviços de agenda, fila do dia e recepção (Fase 7).
 * A fila do dia (kanban) combina os agendamentos do dia com a recepção
 * espontânea (§4.6). O check-in (AGENDADO → AGUARDANDO) e o chamar
 * (→ EM_ATENDIMENTO) são mutações; a listagem tem staleTime curto (fila muda
 * o tempo todo).
 */
export const servicoAgenda = {
  listar: (params: { unit_id: string; data?: string; professional_id?: string }) => {
    const qs = new URLSearchParams({ unit_id: params.unit_id });
    if (params.data) qs.set("data", params.data);
    if (params.professional_id) qs.set("professional_id", params.professional_id);
    return http.get<AppointmentOut[]>(`/appointments?${qs.toString()}`);
  },
  criar: (corpo: AppointmentCreate, chaveIdempotencia?: string) =>
    http.post<AppointmentOut>("/appointments", corpo, { chaveIdempotencia }),
  atualizar: (id: string, corpo: AppointmentUpdate) =>
    http.patch<AppointmentOut>(`/appointments/${id}`, corpo),
  filaDoDia: (unitId: string) =>
    http.get<AppointmentOut[]>(`/appointments/daily-queue?unit_id=${unitId}`),
  chamar: (id: string, professionalId: string) =>
    http.post<AppointmentOut>(`/appointments/${id}/call`, {
      professional_id: professionalId,
    }),
  visitas: (params?: { family_id?: string; professional_id?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.family_id) qs.set("family_id", params.family_id);
    if (params?.professional_id) qs.set("professional_id", params.professional_id);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return http.get<VisitaOut[]>(`/home-visits${q ? `?${q}` : ""}`);
  },
};

export const servicoProfissionais = {
  listar: (unitId?: string) =>
    http.get<{ id: string; nome: string; funcao_nob_rh?: string | null }[]>(
      `/professionals${unitId ? `?unit_id=${unitId}` : ""}`,
    ),
};

export const servicoRecepcao = {
  filaDoDia: (unitId: string, status?: string) => {
    const qs = new URLSearchParams({ unit_id: unitId });
    if (status) qs.set("status", status);
    return http.get<ReceptionOut[]>(`/reception?${qs.toString()}`);
  },
  registrar: (corpo: {
    unit_id: string;
    person_id?: string | null;
    family_id?: string | null;
    nome_informado?: string | null;
    motivo?: string | null;
  }) => http.post<ReceptionOut>("/reception", corpo),
  atualizar: (id: string, corpo: { status?: string; motivo?: string | null }) =>
    http.patch<ReceptionOut>(`/reception/${id}`, corpo),
};
