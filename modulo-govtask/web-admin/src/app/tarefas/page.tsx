"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  formatDate,
  daysUntil,
  prazoColor,
  prazoBgColor,
  STATUS_COLORS,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  cn,
} from "@/lib/utils";
import type { TarefaListItem } from "@/types/govtask";
import { Tabs } from "@/components/ui/Tabs";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  Clock,
  AlertTriangle,
  Filter,
  Search,
  LayoutGrid,
  List,
  CheckCircle,
} from "lucide-react";
import { notify } from "@/components/ui/Toast";

const BOARD_STATUSES = [
  "AGUARDANDO_ACEITE",
  "EM_ANDAMENTO",
  "ENTREGUE",
  "CONCLUIDA",
] as const;

const PRIORITY_OPTIONS = ["BAIXA", "NORMAL", "ALTA", "URGENTE"] as const;

export default function TarefasPage() {
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("quadro");
  const [filter, setFilter] = useState<"minhas" | "todas" | "atrasadas">("minhas");
  const [statusFilter, setStatusFilter] = useState("");
  const [setorFilter, setSetorFilter] = useState("");
  const [convenioFilter, setConvenioFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const handleAceitar = async (tarefaId: string) => {
    try {
      await api.aceitarTarefa(tarefaId);
      notify.success("Tarefa aceita!");
      load();
    } catch (e: any) {
      notify.error(e.message || "Erro ao aceitar tarefa");
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (filter === "minhas") params.minhas = true;
      if (filter === "atrasadas") params.atrasadas = true;
      if (statusFilter) params.status = statusFilter;
      if (setorFilter) params.setor_id = setorFilter;
      if (convenioFilter) params.convenio_id = convenioFilter;
        const data = await api.listTarefas(params as Parameters<typeof api.listTarefas>[0]);
        setTarefas(data as unknown as TarefaListItem[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter, statusFilter, setorFilter, convenioFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.listSetores().then(setSetores).catch(console.error);
  }, []);

  const columnsByStatus = (statuses: readonly string[]) => {
    const map: Record<string, TarefaListItem[]> = {};
    for (const s of statuses) {
      map[s] = tarefas.filter((t) => t.status === s);
    }
    return map;
  };

  const boardColumns = columnsByStatus(BOARD_STATUSES);

  const tableColumns = [
    {
      key: "titulo",
      label: "Título",
      sortable: false,
      render: (row: TarefaListItem) => (
        <Link href={`/tarefas/${row.id}`} className="font-medium text-[#1D4ED8] hover:underline">
          {row.titulo}
        </Link>
      ),
    },
    {
      key: "convenio",
      label: "Convênio",
      render: (row: TarefaListItem) =>
        row.convenio ? (
          <Link href={`/convenios/${row.convenio.id}`} className="text-[#1D4ED8] hover:underline text-sm">
            {row.convenio.titulo}
          </Link>
        ) : (
          <span className="text-gray-400 text-sm">—</span>
        ),
    },
    {
      key: "etapa",
      label: "Etapa",
      render: (row: TarefaListItem) => (
        <span className="text-sm text-gray-600">{row.etapa?.nome || "—"}</span>
      ),
    },
    {
      key: "atribuida_a",
      label: "Responsável",
      render: (row: TarefaListItem) => (
        <span className="text-sm text-gray-600">{row.atribuida_a?.name || "—"}</span>
      ),
    },
    {
      key: "prioridade",
      label: "Prioridade",
      sortable: true,
      render: (row: TarefaListItem) => <PriorityBadge priority={row.prioridade} />,
    },
    {
      key: "prazo",
      label: "Prazo",
      sortable: true,
      render: (row: TarefaListItem) => {
        const dias = row.prazo ? daysUntil(row.prazo) : 0;
        return (
          <span className={cn("text-sm font-medium", prazoColor(dias))}>
            {row.prazo ? formatDate(row.prazo) : "—"}
            {row.prazo && (
              <span className="ml-1 text-xs">
                ({dias < 0 ? `Atrasada ${Math.abs(dias)}d` : dias === 0 ? "Hoje" : `${dias}d`})
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: false,
      render: (row: TarefaListItem) => <StatusPill status={row.status} />,
    },
  ];

  const handleSort = (key: string, dir: "asc" | "desc") => {
    const sorted = [...tarefas].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (key === "prazo") {
        va = a.prazo || "";
        vb = b.prazo || "";
      } else if (key === "prioridade") {
        const order = ["BAIXA", "NORMAL", "ALTA", "URGENTE"];
        va = order.indexOf(a.prioridade);
        vb = order.indexOf(b.prioridade);
      }
      if (dir === "asc") return va > vb ? 1 : -1;
      return va < vb ? 1 : -1;
    });
    setTarefas(sorted);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Tarefas</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={Filter}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filtros
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {(["minhas", "todas", "atrasadas"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              filter === f
                ? "bg-primary-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            )}
          >
            {f === "minhas" ? "Minhas" : f === "atrasadas" ? "Atrasadas" : "Todas"}
          </button>
        ))}
        <div className="ml-auto">
          <Tabs
            tabs={[
              { key: "quadro", label: "Quadro" },
              { key: "lista", label: "Lista" },
            ]}
            active={view}
            onChange={setView}
          />
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-xl border border-gray-100">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todos</option>
              {BOARD_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
              <option value="DEVOLVIDA">Devolvida</option>
              <option value="CONTESTADA">Contestada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Setor</label>
            <select
              value={setorFilter}
              onChange={(e) => setSetorFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todos</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Prioridade</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todas</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setStatusFilter("");
                setSetorFilter("");
                setPriorityFilter("");
                setConvenioFilter("");
              }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      )}

      {loading ? (
        view === "quadro" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {BOARD_STATUSES.map((s) => (
              <div key={s} className="bg-gray-50 rounded-xl p-3 space-y-3">
                <Skeleton variant="text" className="h-5 w-24" />
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="card" className="h-24" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <DataTable columns={tableColumns} data={[]} loading />
        )
      ) : view === "quadro" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {BOARD_STATUSES.map((status) => {
            const items = boardColumns[status] || [];
            return (
              <div key={status} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className={cn("text-sm font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[status])}>
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="text-xs bg-white text-gray-500 px-2 py-0.5 rounded-full font-medium">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => {
                    const dias = t.prazo ? daysUntil(t.prazo) : 0;
                    const overdue = t.atrasada || (t.prazo && dias < 0);
                    return (
                      <div
                        key={t.id}
                        onClick={() => router.push(`/tarefas/${t.id}`)}
                        className="bg-white rounded-lg p-3 shadow-sm hover:shadow transition-shadow border border-gray-100 cursor-pointer"
                      >
                        <p className="text-sm font-medium text-gray-900 line-clamp-2">{t.titulo}</p>
                        {t.convenio && (
                          <Link
                            href={`/convenios/${t.convenio.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-[#1D4ED8] hover:underline mt-0.5 block"
                          >
                            {t.convenio.titulo}
                          </Link>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <PriorityBadge priority={t.prioridade} />
                          {t.prazo && (
                            <span className={cn("text-xs font-medium flex items-center gap-1", prazoColor(dias))}>
                              <Clock size={10} />
                              {dias < 0
                                ? `${Math.abs(dias)}d atraso`
                                : dias === 0
                                  ? "Hoje"
                                  : `${dias}d`}
                            </span>
                          )}
                          {overdue && (
                            <Badge label="Atrasada" color="bg-[#FEE4E2] text-[#B42318]" />
                          )}
                        </div>
                        {t.atribuida_a && (
                          <p className="text-xs text-gray-400 mt-1.5">{t.atribuida_a.name}</p>
                        )}
                        {t.status === "AGUARDANDO_ACEITE" && t.atribuida_a?.id === user?.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAceitar(t.id); }}
                            className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-btn bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] transition-colors"
                          >
                            <CheckCircle size={14} /> Aceitar
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">Nenhuma tarefa</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : tarefas.length === 0 ? (
        <EmptyState
          icon="clipboard-list"
          title="Nenhuma tarefa encontrada"
          description={
            filter === "minhas"
              ? "Você não possui tarefas atribuídas no momento."
              : "Nenhuma tarefa corresponde aos filtros selecionados."
          }
        />
      ) : (
        <DataTable
          columns={tableColumns as any}
          data={tarefas as unknown as Record<string, unknown>[]}
          onSort={handleSort}
          onRowClick={(row) => router.push(`/tarefas/${row.id as string}`)}
        />
      )}
    </div>
  );
}
