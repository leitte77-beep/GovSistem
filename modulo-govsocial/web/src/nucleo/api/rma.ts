import { http } from "@/nucleo/http/clienteHttp";
import type {
  RmaAjusteCreate,
  RmaAjusteOut,
  RmaDrillDown,
  RmaFechamentoListItem,
  RmaFechamentoOut,
} from "@/tipos/rma";

/**
 * Serviços do RMA (Fase 8, §4.8).
 * - `calcular` é POST com query params e SEM corpo (idempotente: recalcula ou
 *   devolve o existente).
 * - `fechar` envia chave de idempotência (§14) — fechamento é irreversível.
 * - `exportarCsv` retorna texto cru (Content-Disposition no backend).
 */
export const servicoRma = {
  listar: (params: { unit_id?: string; ano?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params.unit_id) qs.set("unit_id", params.unit_id);
    if (params.ano) qs.set("ano", String(params.ano));
    if (params.status) qs.set("status", params.status);
    const q = qs.toString();
    return http.get<RmaFechamentoListItem[]>(`/rma${q ? `?${q}` : ""}`);
  },

  calcular: (unitId: string, ano: number, mes: number) => {
    const qs = new URLSearchParams({
      unit_id: unitId,
      ano: String(ano),
      mes: String(mes),
    });
    return http.post<RmaFechamentoOut>(`/rma/calculate?${qs.toString()}`);
  },

  obter: (id: string) => http.get<RmaFechamentoOut>(`/rma/${id}`),

  ajustar: (id: string, corpo: RmaAjusteCreate) =>
    http.post<RmaAjusteOut>(`/rma/${id}/adjust`, corpo),

  fechar: (id: string, chaveIdempotencia: string) =>
    http.post<RmaFechamentoOut>(`/rma/${id}/close`, {}, { chaveIdempotencia }),

  reabrir: (id: string, motivo: string) =>
    http.post<RmaFechamentoOut>(`/rma/${id}/reopen`, { motivo_reabertura: motivo }),

  drillDown: (id: string, bloco: string, campo: string) => {
    const qs = new URLSearchParams({ bloco, campo });
    return http.get<RmaDrillDown>(`/rma/${id}/drilldown?${qs.toString()}`);
  },

  exportarCsv: (id: string) => http.getTexto(`/rma/${id}/export`),
};
