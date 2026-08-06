import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Eye, Download, Save } from "lucide-react";
import { http } from "@/nucleo/http/clienteHttp";

interface CampoDicionario { tabela: string; label: string; campos: { campo: string; titulo: string }[] }

interface ColunaConfig { campo: string; titulo: string; alinhamento?: string; largura?: number; ordenavel?: boolean }
interface FiltroConfig { campo: string; titulo: string; tipo: string; obrigatorio?: boolean; valor_padrao?: string }
interface RelatorioFull { id: string; nome: string; descricao: string | null; grupo: string | null;
  fonte_dados: { tipo: string; sql?: string; tabelas?: string[] };
  colunas: ColunaConfig[]; filtros: FiltroConfig[] | null; agrupamentos: any[] | null;
  ordenacao: any[] | null; layout: any; compartilhado: boolean;
}

export default function ConstrutorRelatorio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNovo = id === "novo";

  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [sql, setSql] = useState("");
  const [colunas, setColunas] = useState<ColunaConfig[]>([]);
  const [filtros, setFiltros] = useState<FiltroConfig[]>([]);
  const [visualizando, setVisualizando] = useState(false);
  const [dadosVisualizacao, setDadosVisualizacao] = useState<any>(null);

  const { data: dicionario = [] } = useQuery<CampoDicionario[]>({
    queryKey: ["report-dictionary"],
    queryFn: async () => http.get<CampoDicionario[]>("/reports/dictionary"),
  });

  const { data: relatorio } = useQuery<RelatorioFull>({
    queryKey: ["relatorio", id],
    enabled: !isNovo,
    queryFn: async () => http.get<RelatorioFull>(`/reports/${id}`),
  });

  useEffect(() => {
    if (relatorio) {
      setNome(relatorio.nome);
      setGrupo(relatorio.grupo || "");
      setDescricao(relatorio.descricao || "");
      setSql(relatorio.fonte_dados?.sql || "");
      setColunas(relatorio.colunas || []);
      setFiltros(relatorio.filtros || []);
    }
  }, [relatorio]);

  const salvar = useMutation({
    mutationFn: async () => {
      const body = { nome, grupo: grupo || null, descricao: descricao || null,
        fonte_dados: { tipo: "sql", sql }, colunas, filtros: filtros.length > 0 ? filtros : null,
        layout: { orientacao: "retrato", tamanho: "A4", zebrado: true },
        compartilhado: false };
      if (isNovo) return http.post("/reports", body);
      return http.patch(`/reports/${id}`, body);
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["relatorios"] });
      if (isNovo) navigate(`/relatorios/${data.id}`);
    },
  });

  const executar = async (formato: string) => {
    try {
      const result = await http.post<any>(`/reports/${id}/execute?formato=${formato}`, {});
      if (formato === "json") setDadosVisualizacao({ dados: result.dados, colunas: result.colunas, total: result.total });
      else {
        const blob = await http.postBlob(`/reports/${id}/execute?formato=${formato}`, {});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${nome}.${formato}`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) { alert("Erro ao executar: " + (e?.message || "desconhecido")); }
  };

  const adicionarColuna = (campo: CampoDicionario["campos"][0]) => {
    if (colunas.some(c => c.campo === campo.campo)) return;
    setColunas([...colunas, { campo: campo.campo, titulo: campo.titulo, alinhamento: "esquerda", ordenavel: true }]);
  };

  return (
    <div className="space-y-4 p-6">
      <Link to="/relatorios" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Relatórios
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{isNovo ? "Novo Relatório" : nome || "Editar Relatório"}</h1>
        <div className="flex gap-2">
          {!isNovo && (
            <>
              <button onClick={() => { setVisualizando(true); executar("json"); }} className="inline-flex items-center gap-1 rounded-input border px-3 py-1.5 text-sm hover:border-primary">
                <Eye className="h-4 w-4" /> Visualizar
              </button>
              <button onClick={() => executar("pdf")} className="inline-flex items-center gap-1 rounded-input border px-3 py-1.5 text-sm hover:border-primary">
                <Download className="h-4 w-4" /> PDF
              </button>
              <button onClick={() => executar("excel")} className="inline-flex items-center gap-1 rounded-input border px-3 py-1.5 text-sm hover:border-primary">
                <Download className="h-4 w-4" /> Excel
              </button>
              <button onClick={() => executar("csv")} className="inline-flex items-center gap-1 rounded-input border px-3 py-1.5 text-sm hover:border-primary">
                <Download className="h-4 w-4" /> CSV
              </button>
            </>
          )}
          <button onClick={() => salvar.mutate()} disabled={!nome || !sql}
            className="inline-flex items-center gap-1 rounded-input bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40">
            <Save className="h-4 w-4" /> Salvar
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do relatório"
            className="w-full rounded-input border border-ink-soft/20 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input value={grupo} onChange={e => setGrupo(e.target.value)} placeholder="Grupo (opcional)"
              className="flex-1 rounded-input border border-ink-soft/20 px-3 py-2 text-sm" />
            <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição"
              className="flex-1 rounded-input border border-ink-soft/20 px-3 py-2 text-sm" />
          </div>
          <textarea value={sql} onChange={e => setSql(e.target.value)} placeholder="SELECT ... FROM ..." rows={6}
            className="w-full rounded-input border border-ink-soft/20 px-3 py-2 text-sm font-mono" />
          {colunas.length > 0 && (
            <div className="text-xs text-ink-soft">{colunas.length} colunas selecionadas: {colunas.map(c => c.titulo).join(", ")}</div>
          )}
        </div>
        <div className="space-y-2 rounded-cartao border border-ink-soft/15 bg-surface p-4">
          <h3 className="text-sm font-semibold">Dicionário de Dados</h3>
          {dicionario.map(tabela => (
            <details key={tabela.tabela} className="text-sm">
              <summary className="cursor-pointer font-medium text-primary">{tabela.label}</summary>
              <div className="ml-3 mt-1 space-y-0.5">
                {tabela.campos.map(campo => (
                  <button key={campo.campo} onClick={() => adicionarColuna(campo)}
                    className="block w-full text-left text-xs text-ink-soft hover:text-primary py-0.5">
                    <Plus className="inline h-3 w-3 mr-1" />{campo.titulo} <code className="text-[10px] opacity-50">{campo.campo}</code>
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      {visualizando && dadosVisualizacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setVisualizando(false)}>
          <div className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-cartao bg-white p-6 shadow-elevado" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{nome}</h2>
              <span className="text-sm text-ink-soft">{dadosVisualizacao.total} registros</span>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead><tr>{dadosVisualizacao.colunas.map((c: any) => <th key={c.campo} className="border-b px-3 py-2 text-left text-xs font-semibold uppercase text-ink-soft">{c.titulo}</th>)}</tr></thead>
              <tbody>{dadosVisualizacao.dados.slice(0, 500).map((d: any, i: number) => <tr key={i} className="border-b border-ink-soft/10">{dadosVisualizacao.colunas.map((c: any) => <td key={c.campo} className="px-3 py-1.5">{d[c.campo]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
