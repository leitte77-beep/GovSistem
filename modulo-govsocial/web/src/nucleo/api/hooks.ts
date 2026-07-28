import { useQuery } from "@tanstack/react-query";
export function useProntuariosDaFamilia(id: string) {
  return useQuery({ queryKey: ["prontuarios", id], queryFn: () => Promise.resolve([]), enabled: !!id, staleTime: 20000 });
}
export function useTiposServico() {
  return useQuery({ queryKey: ["service-types"], queryFn: () => Promise.resolve([]), staleTime: 60000 });
}
