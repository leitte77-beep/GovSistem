import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Tabela } from "@/ui/Tabela";
import { http } from "@/nucleo/http/clienteHttp";
import type { Coluna } from "@/ui/Tabela";

interface AtalhoExterno {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  ordem: number;
  is_active: boolean;
  description: string | null;
}

interface AtalhoFormData {
  label: string;
  url: string;
  ordem: number;
  description: string;
}

const COLUNAS: Coluna<AtalhoExterno>[] = [
  { chave: "label", titulo: "Nome", ordenavel: true },
  { chave: "url", titulo: "URL", ordenavel: true },
  { chave: "ordem", titulo: "Ordem", ordenavel: true, alinhamento: "direita" },
];

export default function AtalhosAdmin() {
  const [formulario, setFormulario] = useState<{ id?: string; data: AtalhoFormData } | null>(null);
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery<AtalhoExterno[]>({
    queryKey: ["external-shortcuts-admin"],
    queryFn: async () => http.get<AtalhoExterno[]>("/shortcuts"),
  });

  const criar = useMutation({
    mutationFn: (body: AtalhoFormData) => http.post<AtalhoExterno>("/shortcuts", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["external-shortcuts-admin"] }),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, ...body }: AtalhoFormData & { id: string }) =>
      http.patch<AtalhoExterno>(`/shortcuts/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["external-shortcuts-admin"] }),
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Atalhos externos</h1>
        <button
          onClick={() => setFormulario({ data: { label: "", url: "", ordem: 0, description: "" } })}
          className="inline-flex items-center gap-1.5 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-focus"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Novo atalho
        </button>
      </div>

      <Tabela
        colunas={COLUNAS}
        dados={data}
        chaveLinha={(a) => a.id}
        caption="Atalhos externos configurados"
        carregando={isLoading}
        totalRegistros={data.length}
        vazio={<span className="text-ink-soft">Nenhum atalho externo configurado.</span>}
      />

      {formulario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setFormulario(null)}>
          <div className="w-full max-w-md rounded-cartao bg-surface p-6 shadow-elevado" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{formulario.id ? "Editar atalho" : "Novo atalho"}</h2>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); }}>
              <label className="block">
                <span className="text-sm font-medium">Nome</span>
                <input className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm" value={formulario.data.label} onChange={(e) => setFormulario({ ...formulario, data: { ...formulario.data, label: e.target.value } })} required />
              </label>
              <label className="block">
                <span className="text-sm font-medium">URL</span>
                <input type="url" className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm" value={formulario.data.url} onChange={(e) => setFormulario({ ...formulario, data: { ...formulario.data, url: e.target.value } })} required />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Ordem</span>
                <input type="number" className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm" value={formulario.data.ordem} onChange={(e) => setFormulario({ ...formulario, data: { ...formulario.data, ordem: Number(e.target.value) } })} />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Descrição</span>
                <input className="mt-1 w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm" value={formulario.data.description} onChange={(e) => setFormulario({ ...formulario, data: { ...formulario.data, description: e.target.value } })} />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormulario(null)} className="rounded-input border border-ink-soft/20 px-4 py-2 text-sm">Cancelar</button>
                <button type="submit" className="rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    if (formulario.id) {
                      atualizar.mutate({ id: formulario.id, ...formulario.data });
                    } else {
                      criar.mutate(formulario.data);
                    }
                    setFormulario(null);
                  }}>
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
