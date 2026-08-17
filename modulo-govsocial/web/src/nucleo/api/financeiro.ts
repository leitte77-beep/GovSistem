import { http } from "@/nucleo/http/clienteHttp";
import type {
  DashboardFinanceiro,
  GastoCreate,
  GastoOut,
  GastoUpdate,
  PrestacaoContasOut,
  RepasseCreate,
  RepasseListItem,
  RepasseOut,
  RepasseUpdate,
} from "@/tipos/financeiro";

export const servicoFinanceiro = {
  dashboard: () => http.get<DashboardFinanceiro>("/financeiro/dashboard"),

  prestacaoContas: (ano: number) =>
    http.get<PrestacaoContasOut>(`/financeiro/prestacao-contas?ano=${ano}`),

  listarRepasses: (params?: { esfera?: string; status?: string; skip?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.esfera) qs.set("esfera", params.esfera);
    if (params?.status) qs.set("status", params.status);
    if (params?.skip !== undefined) qs.set("skip", String(params.skip));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return http.get<RepasseListItem[]>(`/financeiro/repasses${q ? `?${q}` : ""}`);
  },

  criarRepasse: (corpo: RepasseCreate) =>
    http.post<RepasseOut>("/financeiro/repasses", corpo),

  obterRepasse: (id: string) =>
    http.get<RepasseOut>(`/financeiro/repasses/${id}`),

  atualizarRepasse: (id: string, corpo: RepasseUpdate) =>
    http.patch<RepasseOut>(`/financeiro/repasses/${id}`, corpo),

  excluirRepasse: (id: string) =>
    http.delete<void>(`/financeiro/repasses/${id}`),

  encerrarRepasse: (id: string) =>
    http.post<RepasseOut>(`/financeiro/repasses/${id}/encerrar`),

  listarGastos: (repasseId: string, params?: { skip?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.skip !== undefined) qs.set("skip", String(params.skip));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return http.get<GastoOut[]>(`/financeiro/repasses/${repasseId}/gastos${q ? `?${q}` : ""}`);
  },

  criarGasto: (repasseId: string, corpo: GastoCreate) =>
    http.post<GastoOut>(`/financeiro/repasses/${repasseId}/gastos`, corpo),

  atualizarGasto: (repasseId: string, gastoId: string, corpo: GastoUpdate) =>
    http.patch<GastoOut>(`/financeiro/repasses/${repasseId}/gastos/${gastoId}`, corpo),

  excluirGasto: (repasseId: string, gastoId: string) =>
    http.delete<void>(`/financeiro/repasses/${repasseId}/gastos/${gastoId}`),
};
