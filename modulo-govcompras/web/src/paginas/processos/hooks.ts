import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import type { ProcessoDetalhe } from "@/nucleo/tipos";
import type { EtapaFluxo } from "@/ui";

export function useProcesso(id: string | undefined) {
  return useQuery({
    queryKey: ["processo", id],
    queryFn: () => api.get<ProcessoDetalhe>(`/processos/${id}`),
    enabled: !!id,
  });
}

export function useEtapasFluxo(id: string | undefined) {
  return useQuery({
    queryKey: ["processo", id, "etapas-fluxo"],
    queryFn: () => api.get<EtapaFluxo[]>(`/processos/${id}/etapas-fluxo`),
    enabled: !!id,
  });
}

export function useInvalidarProcesso(id: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["processo", id] });
    queryClient.invalidateQueries({ queryKey: ["processos"] });
  };
}
