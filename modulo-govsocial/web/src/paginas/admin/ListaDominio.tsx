import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, ArrowLeft } from "lucide-react";
import { Tabela } from "@/ui/Tabela";
import { http } from "@/nucleo/http/clienteHttp";
import type { Coluna } from "@/ui/Tabela";

interface CatalogoEntry {
  slug: string;
  label: string;
}

interface DomainRecord {
  id: string;
  descricao: string;
  [key: string]: unknown;
}

const COLUNAS: Coluna<DomainRecord>[] = [
  { chave: "descricao", titulo: "Descrição", ordenavel: true },
];

export default function ListaDominio() {
  const { slug } = useParams<{ slug: string }>();
  const [editando, setEditando] = useState<{ id: string; descricao: string } | null>(null);
  const [novo, setNovo] = useState(false);
  const [valor, setValor] = useState("");
  const qc = useQueryClient();

  const { data: catalogo = [] } = useQuery<CatalogoEntry[]>({
    queryKey: ["admin-cadastros-catalogo"],
    queryFn: async () => http.get<CatalogoEntry[]>("/admin/cadastros/catalogo"),
    staleTime: 300_000,
  });
  const entry = catalogo.find((c) => c.slug === slug);
  const label = entry?.label ?? slug ?? "";

  const { data = [], isLoading } = useQuery<DomainRecord[]>({
    queryKey: ["admin-cadastros", slug],
    enabled: !!slug,
    queryFn: async () => http.get<DomainRecord[]>(`/admin/cadastros/${slug}`),
  });

  const criar = useMutation({
    mutationFn: (descricao: string) => http.post<DomainRecord>(`/admin/cadastros/${slug}`, { descricao }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cadastros", slug] }); setNovo(false); setValor(""); },
  });

  const atualizar = useMutation({
    mutationFn: ({ id, descricao }: { id: string; descricao: string }) => http.patch<DomainRecord>(`/admin/cadastros/${slug}/${id}`, { descricao }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cadastros", slug] }); setEditando(null); },
  });

  return (
    <div className="space-y-3 p-6">
      <Link to="/administracao/cadastros" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Catálogo
      </Link>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{label}</h2>
        <button onClick={() => { setValor(""); setNovo(true); }}
          className="inline-flex items-center gap-1 rounded-input bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">
          <Plus className="h-4 w-4" /> Novo
        </button>
      </div>
      <Tabela colunas={COLUNAS} dados={data} chaveLinha={(r) => r.id} caption={label} carregando={isLoading} totalRegistros={data.length}
        vazio={<span className="text-ink-soft">Nenhum registro cadastrado.</span>} />

      {(novo || editando) && (
        <button type="button" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 cursor-pointer" onClick={() => { setNovo(false); setEditando(null); }}>
          <div className="w-full max-w-sm rounded-cartao bg-surface p-6 shadow-elevado" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold">{editando ? "Editar" : "Novo registro"}</h3>
            <input className="w-full rounded-input border border-ink-soft/20 bg-surface px-3 py-2 text-sm" value={editando ? editando.descricao : valor}
              onChange={(e) => editando ? setEditando({ ...editando, descricao: e.target.value }) : setValor(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { const v = editando ? editando.descricao : valor; if (editando) atualizar.mutate({ id: editando.id, descricao: v }); else criar.mutate(v); } }} />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => { setNovo(false); setEditando(null); }} className="rounded-input border px-3 py-1.5 text-sm">Cancelar</button>
              <button onClick={() => { const v = editando ? editando.descricao : valor; if (editando) atualizar.mutate({ id: editando.id, descricao: v }); else criar.mutate(v); }} className="rounded-input bg-primary px-3 py-1.5 text-sm font-semibold text-white">Salvar</button>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
