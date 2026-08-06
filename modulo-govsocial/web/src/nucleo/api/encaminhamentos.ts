import { http } from "@/nucleo/http/clienteHttp";
import type {
  EncaminhamentoCreate,
  EncaminhamentoListItem,
  EncaminhamentoOut,
} from "@/tipos/encaminhamentos";

/**
 * Serviços de encaminhamentos e contrarreferência (Fase 7).
 * O painel separa "Enviados" (unit_id de origem) e "Recebidos"
 * (unidade_destino_id). A devolutiva (contrarreferência) é sensível: só chega no
 * detalhe (obter por id), por isso o cliente usa `semCache`.
 */
export const servicoEncaminhamentos = {
  listar: (params: { unit_id?: string; tipo?: string; status?: string; destino_id?: string }) => {
    const qs = new URLSearchParams();
    if (params.unit_id) qs.set("unit_id", params.unit_id);
    if (params.tipo) qs.set("tipo", params.tipo);
    if (params.status) qs.set("status", params.status);
    if (params.destino_id) qs.set("destino_id", params.destino_id);
    const q = qs.toString();
    return http.get<EncaminhamentoListItem[]>(`/encaminhamentos${q ? `?${q}` : ""}`);
  },
  obter: (id: string) =>
    http.get<EncaminhamentoOut>(`/encaminhamentos/${id}`, { semCache: true }),
  criar: (corpo: EncaminhamentoCreate, chaveIdempotencia?: string) =>
    http.post<EncaminhamentoOut>("/encaminhamentos", corpo, { chaveIdempotencia }),
  aceitar: (id: string, profissionalDestinoId?: string | null) =>
    http.post<EncaminhamentoOut>(`/encaminhamentos/${id}/accept`, {
      profissional_destino_id: profissionalDestinoId ?? null,
    }),
  recusar: (id: string, motivoRecusa: string) =>
    http.post<EncaminhamentoOut>(`/encaminhamentos/${id}/reject`, {
      motivo_recusa: motivoRecusa,
    }),
  devolver: (id: string, devolutiva: string | null) =>
    http.post<EncaminhamentoOut>(`/encaminhamentos/${id}/return`, { devolutiva }),
  gerarOficio: (id: string, chaveIdempotencia?: string) =>
    http.post<{ message: string; numero_oficio: number | null; status: string }>(
      `/encaminhamentos/${id}/generate-office`,
      undefined,
      { chaveIdempotencia },
    ),
  cancelar: (id: string) =>
    http.post<EncaminhamentoOut>(`/encaminhamentos/${id}/cancel`, undefined),
  pendentes: (unitId: string) =>
    http.get<EncaminhamentoListItem[]>(`/encaminhamentos-pendentes?unit_id=${unitId}`),
};
