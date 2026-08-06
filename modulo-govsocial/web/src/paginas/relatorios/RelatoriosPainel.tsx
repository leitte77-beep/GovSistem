import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Copy } from "lucide-react";
import { Tabela } from "@/ui/Tabela";
import { http } from "@/nucleo/http/clienteHttp";
import type { Coluna } from "@/ui/Tabela";

interface RelatorioResumo {
  id: string; nome: string; descricao: string | null; grupo: string | null;
  compartilhado: boolean; ativo: boolean;
}

export default function RelatoriosPainel() {
  const [grupoFiltro] = useState<string>("");
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery<RelatorioResumo[]>({
    queryKey: ["relatorios", grupoFiltro],
    queryFn: async () => {
      const params = grupoFiltro ? `?grupo=${encodeURIComponent(grupoFiltro)}` : "";
      return http.get<RelatorioResumo[]>(`/reports${params}`);
    },
  });

  const excluir = useMutation({
    mutationFn: (id: string) => http.delete(`/reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relatorios"] }),
  });

  const duplicar = useMutation({
    mutationFn: async (id: string) => {
      const r = await http.get<RelatorioResumo & { fonte_dados: any; colunas: any; filtros: any; agrupamentos: any; ordenacao: any; layout: any }>(`/reports/${id}`);
      return http.post(`/reports`, { ...r, nome: `${r.nome} (cópia)`, compartilhado: false });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relatorios"] }),
  });

  const colunas: Coluna<RelatorioResumo>[] = [
    {
      chave: "nome", titulo: "Nome", ordenavel: true,
      render: (r: RelatorioResumo) => (
        <div className="flex items-center gap-2">
          <Link to={`/relatorios/${r.id}`} className="font-medium text-primary hover:underline">{r.nome}</Link>
          <button onClick={() => duplicar.mutate(r.id)} className="text-ink-soft hover:text-primary" title="Duplicar"><Copy className="h-3.5 w-3.5" /></button>
          <button onClick={() => { if (confirm("Excluir?")) excluir.mutate(r.id); }} className="text-ink-soft hover:text-red-500" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ),
    },
    { chave: "grupo", titulo: "Grupo", ordenavel: true },
    { chave: "compartilhado", titulo: "Compartilhado", alinhamento: "centro" },
  ];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Relatórios Customizáveis</h1>
        <Link to="/relatorios/novo" className="inline-flex items-center gap-1.5 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
          <Plus className="h-4 w-4" /> Novo relatório
        </Link>
      </div>
      <Tabela colunas={colunas} dados={data} chaveLinha={(r) => r.id} caption="Relatórios configurados" carregando={isLoading} totalRegistros={data.length} />
    </div>
  );
}
