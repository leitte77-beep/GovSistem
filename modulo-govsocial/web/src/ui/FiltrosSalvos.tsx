import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { http } from "@/nucleo/http/clienteHttp";

interface FiltroSalvo {
  id: string;
  entidade: string;
  nome: string;
  configuracao: Record<string, unknown>;
  compartilhado: boolean;
}

export function useFiltrosSalvos(entidade: string) {
  const qc = useQueryClient();
  const chave = ["saved-filters", entidade];

  const { data = [] } = useQuery<FiltroSalvo[]>({
    queryKey: chave,
    queryFn: async () => http.get<FiltroSalvo[]>(`/saved-filters/${entidade}`),
    staleTime: 60_000,
  });

  const salvar = useMutation({
    mutationFn: async (filtro: { nome: string; configuracao: Record<string, unknown>; compartilhado?: boolean }) =>
      http.post<FiltroSalvo>(`/saved-filters/${entidade}`, filtro),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => http.delete(`/saved-filters/${entidade}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });

  return { filtros: data, salvar, excluir };
}

export function SeletorFiltrosSalvos({
  entidade,
  aoSelecionar,
  salvando,
}: {
  entidade: string;
  aoSelecionar: (config: Record<string, unknown>) => void;
  salvando: boolean;
}) {
  const { filtros, salvar } = useFiltrosSalvos(entidade);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filtros.length > 0 && (
        <select
          className="rounded-input border border-ink-soft/20 bg-surface px-2 py-1 text-sm"
          onChange={(e) => {
            const f = filtros.find((f) => f.id === e.target.value);
            if (f) aoSelecionar(f.configuracao);
          }}
          defaultValue=""
          aria-label="Filtro salvo"
        >
          <option value="" disabled>Filtros salvos…</option>
          {filtros.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
      )}
      {salvando && (
        <button
          type="button"
          onClick={() => {
            const nome = prompt("Nome para o filtro:");
            if (nome) salvar.mutate({ nome, configuracao: {} });
          }}
          className="inline-flex items-center gap-1 rounded-input border border-ink-soft/20 bg-surface px-2 py-1 text-sm hover:border-primary"
          aria-label="Salvar filtro atual"
        >
          <Save className="h-3.5 w-3.5" />
          Salvar
        </button>
      )}
    </div>
  );
}
