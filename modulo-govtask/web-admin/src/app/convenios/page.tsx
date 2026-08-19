"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import {
  formatDate,
  formatCurrency,
  TIPO_CONVENIO_LABELS,
  CATEGORIA_RECURSO_LABELS,
  ESFERA_LABELS,
  SITUACAO_PROCESSO_LABELS,
  PRIORIDADE_PROCESSO_LABELS,
  cn,
} from "@/lib/utils";
import type { ConvenioListItem } from "@/types/govtask";
import { Plus, Search, CheckSquare, AlertTriangle, CalendarDays, Layers, ChevronRight } from "lucide-react";

const PAGE_SIZE = 15;

export default function ConveniosPage() {
  const router = useRouter();
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [esferaFilter, setEsferaFilter] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [situacaoFilter, setSituacaoFilter] = useState("");
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        skip,
        limit: PAGE_SIZE,
      };
      if (statusFilter) params.status = statusFilter;
      if (tipoFilter) params.tipo = tipoFilter;
      if (esferaFilter) params.esfera = esferaFilter;
      if (categoriaFilter) params.categoria = categoriaFilter;
      if (situacaoFilter) params.situacao = situacaoFilter;
      if (search) params.search = search;
      const data = await api.listConvenios(params as any);
      setConvenios(data);
      setTotal(data.length >= PAGE_SIZE ? skip + PAGE_SIZE + 1 : skip + data.length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, tipoFilter, esferaFilter, categoriaFilter, situacaoFilter, skip]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSkip(0);
    load();
  };

  const Progress = ({ pct, color }: { pct: number | null; color: string }) => {
    const v = Math.min(100, Math.max(0, pct ?? 0));
    return (
      <div className="h-2 bg-[#F0F2F5] rounded-full overflow-hidden flex-1">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${v}%` }} />
      </div>
    );
  };

  const tipoLabel = (c: ConvenioListItem) => {
    if (c.categoria) return CATEGORIA_RECURSO_LABELS[c.categoria] || c.categoria;
    return TIPO_CONVENIO_LABELS[c.tipo] || c.tipo;
  };

  // A API pode devolver o percentual como string (Decimal serializado), entao
  // coage antes de exibir e esconde a casa decimal quando ela e zero.
  const pctLabel = (v: number | null | undefined) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "0";
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  const ProcessCard = ({ c }: { c: ConvenioListItem }) => {
    const fis = Number(c.percentual_fisico ?? 0);
    const fin = Number(c.percentual_financeiro ?? 0);
    const atrasado = c.proximo_prazo && new Date(c.proximo_prazo) < new Date() && c.status !== "CONCLUIDO";
    return (
      <div
        onClick={() => router.push(`/convenios/${c.id}`)}
        className="group bg-surface-card border border-surface-border rounded-card p-5 cursor-pointer card-hover-lift flex flex-col"
      >
        {/* Categoria + identificador */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={tipoLabel(c)} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
          {c.numero_emenda && (
            <span className="text-[12px] font-medium text-[#98A2B3] truncate">
              · {c.numero_emenda}
            </span>
          )}
        </div>

        {/* Título */}
        <h3 className="text-body font-semibold text-[#101828] mt-3 leading-snug group-hover:text-[#1D4ED8] transition-colors line-clamp-2">
          {c.titulo}
        </h3>

        {/* Status + prioridade */}
        <div className="flex items-center gap-2 mt-3">
          <StatusPill status={c.status} />
          {c.prioridade && <PriorityBadge priority={c.prioridade} />}
        </div>

        {/* Valor */}
        <p className="text-h2 text-[#101828] tabular-nums mt-4">{formatCurrency(c.valor)}</p>

        {/* Progresso */}
        <div className="space-y-2.5 mt-4">
          <div className="flex items-center gap-3">
            <span className="text-meta text-[#667085] w-14 shrink-0">Físico</span>
            <Progress pct={fis} color="bg-[#1D4ED8]" />
            <span className="text-meta text-[#101828] tabular-nums w-10 text-right">{pctLabel(fis)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-meta text-[#667085] w-14 shrink-0">Financeiro</span>
            <Progress pct={fin} color="bg-[#067647]" />
            <span className="text-meta text-[#101828] tabular-nums w-10 text-right">{pctLabel(fin)}%</span>
          </div>
        </div>

        {/* Contadores */}
        <div className="flex items-center gap-5 mt-4 text-[13px]">
          <span className="flex items-center gap-1.5 text-[#475467]">
            <CheckSquare className="w-4 h-4 text-[#667085]" />
            <strong className="text-[#101828] tabular-nums">{c.tarefas_abertas ?? 0}</strong> tarefas
          </span>
          <span className="flex items-center gap-1.5 text-[#475467]">
            <AlertTriangle className="w-4 h-4 text-[#B54708]" />
            <strong className="text-[#101828] tabular-nums">{c.pendencias ?? 0}</strong> pendências
          </span>
        </div>

        {/* Prazo */}
        <div className="flex items-center gap-1.5 mt-3 text-meta">
          <CalendarDays className="w-3.5 h-3.5 text-[#667085]" />
          <span className={atrasado ? "text-[#B42318] font-medium" : "text-[#667085]"}>
            {c.proximo_prazo ? formatDate(c.proximo_prazo) : "Sem prazo"}
            {atrasado ? " · atrasado" : ""}
          </span>
        </div>

        {/* Etapa atual */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F0F2F5] text-[12px] text-[#667085]">
          <Layers className="w-3.5 h-3.5 text-[#1D4ED8]" />
          <span className="truncate">{c.etapa_atual || SITUACAO_PROCESSO_LABELS[c.situacao || ""] || "—"}</span>
          <ChevronRight className="w-3.5 h-3.5 ml-auto text-[#98A2B3] group-hover:text-[#1D4ED8] shrink-0" />
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Processos"
        title="Processos"
        description={`${convenios.length} de ${convenios.length} processos`}
        actions={
          <Link href="/convenios/novo" className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold shadow-md hover:bg-[#1E40AF] transition-colors">
            <Plus className="w-4 h-4" /> Novo Processo
          </Link>
        }
      />

      <div className="bg-surface-card border border-surface-border rounded-card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título, objeto, parlamentar, número..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-surface-border rounded-btn bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] text-text-title placeholder:text-text-subtle"
              />
            </div>
          </form>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSkip(0);
            }}
            className="border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
          >
            <option value="">Todos os status</option>
            <option value="RASCUNHO">Rascunho</option>
            <option value="EM_ANDAMENTO">Em Andamento</option>
            <option value="SUSPENSO">Suspenso</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="CANCELADO">Cancelado</option>
          </select>

          <select
            value={tipoFilter}
            onChange={(e) => {
              setTipoFilter(e.target.value);
              setSkip(0);
            }}
            className="border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
          >
            <option value="">Todos os tipos</option>
            <option value="OBRA">Obra</option>
            <option value="AQUISICAO">Aquisição</option>
            <option value="SERVICO">Serviço</option>
            <option value="OUTRO">Outro</option>
          </select>

          <select
            value={categoriaFilter}
            onChange={(e) => { setCategoriaFilter(e.target.value); setSkip(0); }}
            className="border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
          >
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORIA_RECURSO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <select
            value={esferaFilter}
            onChange={(e) => { setEsferaFilter(e.target.value); setSkip(0); }}
            className="border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
          >
            <option value="">Todas as esferas</option>
            {Object.entries(ESFERA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <select
            value={situacaoFilter}
            onChange={(e) => { setSituacaoFilter(e.target.value); setSkip(0); }}
            className="border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
          >
            <option value="">Todas as situações</option>
            {Object.entries(SITUACAO_PROCESSO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface-card border border-surface-border rounded-card p-5 space-y-3">
              <div className="skeleton h-5 w-24" />
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-5 w-28" />
              <div className="skeleton h-2 w-full" />
              <div className="skeleton h-2 w-full" />
            </div>
          ))}
        </div>
      ) : convenios.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="Nenhum convênio encontrado"
          description="Você ainda não possui convênios cadastrados ou nenhum corresponde aos filtros."
          action={
            !search && !statusFilter && !tipoFilter && !esferaFilter && !categoriaFilter && !situacaoFilter
              ? { label: "Criar primeiro convênio", href: "/convenios/novo" }
              : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {convenios.map((c) => <ProcessCard key={c.id} c={c} />)}
          </div>
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-1 pt-1">
              <button
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
                disabled={skip === 0}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="text-[13px] text-[#667085] px-2">
                {Math.floor(skip / PAGE_SIZE) + 1} · {Math.ceil(total / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setSkip(skip + PAGE_SIZE)}
                disabled={skip + PAGE_SIZE >= total}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
