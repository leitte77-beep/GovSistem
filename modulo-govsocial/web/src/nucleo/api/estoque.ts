import { http } from "@/nucleo/http/clienteHttp";
import type { EstoqueCreate, EstoqueListItem, EstoqueMovement, EstoqueOut, EstoqueUpdate } from "@/tipos/estoque";

export const servicoEstoque = {
  listar: (params?: { unit_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.unit_id) qs.set("unit_id", params.unit_id);
    const q = qs.toString();
    return http.get<EstoqueListItem[]>(`/stock${q ? `?${q}` : ""}`);
  },

  criar: (corpo: EstoqueCreate) =>
    http.post<EstoqueOut>("/stock", corpo),

  atualizar: (id: string, corpo: EstoqueUpdate) =>
    http.patch<EstoqueOut>(`/stock/${id}`, corpo),

  movimentar: (id: string, corpo: EstoqueMovement) =>
    http.post<EstoqueOut>(`/stock/${id}/movement`, corpo),
};
