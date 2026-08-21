"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ProcessCard } from "@/components/ui/ProcessCard";
import { SituacaoPill } from "@/components/ui/SituacaoPill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatDate,
  formatCurrency,
  CATEGORIA_RECURSO_LABELS,
  SITUACAO_PROCESSO_LABELS,
  TIPO_CONVENIO_LABELS,
  cn,
  pct,
  pctLabel,
} from "@/lib/utils";
import type { ConvenioListItem } from "@/types/govtask";
import { Plus, Search, LayoutGrid, List } from "lucide-react";
import { notify } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";

const PAGE_SIZE = 30;

export default function ConveniosPage() {
  const { hasPermission } = useAuth();
  const podeCriar = hasPermission(PERM.CREATE);
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [situacaoFilter, setSituacaoFilter] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [view, setView] = useState<"grid" | "lista">("grid");
  const [skip, setSkip] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { skip, limit: PAGE_SIZE };
      if (situacaoFilter) params.situacao = situacaoFilter;
      if (categoriaFilter) params.categoria = categoriaFilter;
      if (search) params.search = search;
      const data = await api.listConvenios(params as any);
      setConvenios(data);
      setTemMais(data.length >= PAGE_SIZE);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, situacaoFilter, categoriaFilter, skip]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.listFavoritos()
      .then((favs) => setFavoritos(new Set(favs.map((f) => f.id))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("govtask_processos_view") : null;
    if (saved === "lista" || saved === "grid") setView(saved);
  }, []);

  const trocarView = (v: "grid" | "lista") => {
    setView(v);
    try {
      localStorage.setItem("govtask_processos_view", v);
    } catch {}
  };

  const toggleFavorito = useCallback(async (id: string, favorito: boolean) => {
    setFavoritos((prev) => {
      const next = new Set(prev);
      if (favorito) next.add(id);
      else next.delete(id);
      return next;
    });
    try {
      if (favorito) await api.favoritar(id);
      else await api.desfavoritar(id);
    } catch (e: any) {
      notify.error(e.message || "Não foi possível atualizar o favorito");
    }
  }, []);

  const selectCls =
    "rounded-lg border border-[#E4E7EC] bg-white px-3 py-2.5 text-[13px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  const tipoLabel = (c: ConvenioListItem) =>
    c.categoria ? CATEGORIA_RECURSO_LABELS[c.categoria] || c.categoria : TIPO_CONVENIO_LABELS[c.tipo] || c.tipo;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] leading-[38px] font-bold text-[#101828] tracking-tight">Processos</h1>
          <p className="text-[14px] text-[#667085] mt-1">
            {convenios.length} de {convenios.length} processos
          </p>
        </div>
        {podeCriar && (
          <Link
            href="/convenios/novo"
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" /> Novo Processo
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSkip(0);
            load();
          }}
          className="flex-1 min-w-[240px]"
        >
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A2B3]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, objeto, parlamentar, número..."
              className="w-full rounded-lg border border-[#E4E7EC] bg-white pl-10 pr-4 py-2.5 text-[13px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
            />
          </div>
        </form>

        <select
          value={situacaoFilter}
          onChange={(e) => {
            setSituacaoFilter(e.target.value);
            setSkip(0);
          }}
          className={selectCls}
        >
          <option value="">Todas as situações</option>
          {Object.entries(SITUACAO_PROCESSO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={categoriaFilter}
          onChange={(e) => {
            setCategoriaFilter(e.target.value);
            setSkip(0);
          }}
          className={selectCls}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(CATEGORIA_RECURSO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-lg border border-[#E4E7EC] bg-white p-1">
          <button
            type="button"
            onClick={() => trocarView("grid")}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              view === "grid" ? "bg-[#F2F4F7] text-[#344054]" : "text-[#98A2B3] hover:text-[#475467]"
            )}
            aria-label="Visualizar em cartões"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => trocarView("lista")}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              view === "lista" ? "bg-[#F2F4F7] text-[#344054]" : "text-[#98A2B3] hover:text-[#475467]"
            )}
            aria-label="Visualizar em lista"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Resultados */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-[#E4E7EC] rounded-xl p-5 space-y-3">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton h-5 w-28" />
              <div className="skeleton h-1.5 w-full" />
              <div className="skeleton h-1.5 w-full" />
            </div>
          ))}
        </div>
      ) : convenios.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="Nenhum processo encontrado"
          description="Você ainda não possui processos cadastrados ou nenhum corresponde aos filtros."
          action={
            podeCriar && !search && !situacaoFilter && !categoriaFilter
              ? { label: "Novo Processo", href: "/convenios/novo" }
              : undefined
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {convenios.map((c) => (
            <ProcessCard key={c.id} c={c} favorito={favoritos.has(c.id)} onToggleFavorito={toggleFavorito} />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#E4E7EC] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#F9FAFB] text-[12px] uppercase tracking-wide text-[#667085] text-left">
                  <th className="py-3 px-4 font-medium">Processo</th>
                  <th className="py-3 px-4 font-medium">Situação</th>
                  <th className="py-3 px-4 font-medium text-right">Valor</th>
                  <th className="py-3 px-4 font-medium">Físico</th>
                  <th className="py-3 px-4 font-medium">Financeiro</th>
                  <th className="py-3 px-4 font-medium">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {convenios.map((c) => (
                  <tr key={c.id} className="border-t border-[#F2F4F7] hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-3 px-4">
                      <Link href={`/convenios/${c.id}`} className="block min-w-0">
                        <p className="text-[12px] text-[#667085]">
                          {tipoLabel(c)}
                          {c.numero_emenda ? ` · ${c.numero_emenda}` : ""}
                        </p>
                        <p className="font-medium text-[#101828] truncate hover:text-[#1D4ED8] transition-colors">
                          {c.titulo}
                        </p>
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <SituacaoPill situacao={c.situacao} status={c.status} />
                        {c.prioridade && <PriorityBadge priority={c.prioridade} />}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#101828] font-medium">
                      {formatCurrency(c.valor)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <div className="h-1.5 flex-1 bg-[#F2F4F7] rounded-pill overflow-hidden">
                          <div className="h-full bg-[#2E90FA]" style={{ width: `${pct(c.percentual_fisico)}%` }} />
                        </div>
                        <span className="text-[12px] text-[#667085] tabular-nums w-9 text-right">
                          {pctLabel(c.percentual_fisico)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <div className="h-1.5 flex-1 bg-[#F2F4F7] rounded-pill overflow-hidden">
                          <div className="h-full bg-[#12B76A]" style={{ width: `${pct(c.percentual_financeiro)}%` }} />
                        </div>
                        <span className="text-[12px] text-[#667085] tabular-nums w-9 text-right">
                          {pctLabel(c.percentual_financeiro)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[#667085] tabular-nums whitespace-nowrap">
                      {c.proximo_prazo ? formatDate(c.proximo_prazo) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(skip > 0 || temMais) && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            disabled={skip === 0}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Anterior
          </button>
          <span className="text-[13px] text-[#667085] px-2">{Math.floor(skip / PAGE_SIZE) + 1}</span>
          <button
            onClick={() => setSkip(skip + PAGE_SIZE)}
            disabled={!temMais}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
