import { http } from "@/nucleo/http/clienteHttp";
import type {
  BuscaAtivaCreate,
  BuscaAtivaOut,
  BuscaAtivaResumo,
} from "@/tipos/buscaAtiva";

export const servicoBuscaAtiva = {
  listar: (params?: {
    data_inicio?: string;
    data_fim?: string;
    bairro?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.data_inicio) qs.set("data_inicio", params.data_inicio);
    if (params?.data_fim) qs.set("data_fim", params.data_fim);
    if (params?.bairro) qs.set("bairro", params.bairro);
    const q = qs.toString();
    return http.get<BuscaAtivaOut[]>(`/busca-ativa${q ? `?${q}` : ""}`);
  },

  obter: (id: string) => http.get<BuscaAtivaOut>(`/busca-ativa/${id}`),

  criar: (body: BuscaAtivaCreate) =>
    http.post<BuscaAtivaOut>("/busca-ativa", body),

  atualizar: (id: string, body: Partial<BuscaAtivaCreate>) =>
    http.patch<BuscaAtivaOut>(`/busca-ativa/${id}`, body),

  excluir: (id: string) => http.delete<void>(`/busca-ativa/${id}`),

  dashboard: (params?: { data_inicio?: string; data_fim?: string }) => {
    const qs = new URLSearchParams();
    if (params?.data_inicio) qs.set("data_inicio", params.data_inicio);
    if (params?.data_fim) qs.set("data_fim", params.data_fim);
    const q = qs.toString();
    return http.get<BuscaAtivaResumo>(
      `/busca-ativa/dashboard${q ? `?${q}` : ""}`,
    );
  },

  uploadFotos: (id: string, fotos: File[]) => {
    const form = new FormData();
    fotos.forEach((f) => form.append("fotos", f));
    return http.post<{ fotos_urls: string[] }>(
      `/busca-ativa/${id}/fotos`,
      form,
    );
  },
};
