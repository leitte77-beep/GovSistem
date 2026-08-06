"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  formatDate,
  formatCurrency,
  TIPO_CONVENIO_LABELS,
} from "@/lib/utils";
import type { ConvenioListItem } from "@/types/govtask";
import { Plus, Search, Filter, Edit, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { notify } from "@/components/ui/Toast";

const PAGE_SIZE = 15;

export default function ConveniosPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const canEdit = hasRole("ASSESSOR", "ADMIN");
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        skip,
        limit: PAGE_SIZE,
      };
      if (statusFilter) params.status = statusFilter;
      if (tipoFilter) params.tipo = tipoFilter;
      if (search) params.search = search;
      const data = await api.listConvenios(params as any);
      setConvenios(data);
      setTotal(data.length >= PAGE_SIZE ? skip + PAGE_SIZE + 1 : skip + data.length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, tipoFilter, skip]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSkip(0);
    load();
  };

  const columns = [
    {
      key: "titulo",
      label: "Título",
      render: (row: ConvenioListItem) => (
        <span className="font-medium text-gray-900">{row.titulo}</span>
      ),
    },
    {
      key: "numero_protocolo_governo",
      label: "Protocolo",
      render: (row: ConvenioListItem) =>
        row.numero_protocolo_governo || <span className="text-gray-400">—</span>,
    },
    {
      key: "tipo",
      label: "Tipo",
      render: (row: ConvenioListItem) => TIPO_CONVENIO_LABELS[row.tipo] || row.tipo,
    },
    {
      key: "etapa_atual",
      label: "Etapa Atual",
      render: (row: ConvenioListItem) =>
        row.etapa_atual || <span className="text-gray-400">—</span>,
    },
    {
      key: "proximo_prazo",
      label: "Próximo Prazo",
      sortable: true,
      render: (row: ConvenioListItem) => (
        <span className="text-sm">{formatDate(row.proximo_prazo)}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row: ConvenioListItem) => <StatusPill status={row.status} />,
    },
    {
      key: "valor",
      label: "Valor",
      render: (row: ConvenioListItem) => (
        <span className="text-sm tabular-nums">{formatCurrency(row.valor)}</span>
      ),
    },
    {
      key: "created_at",
      label: "Criado em",
      sortable: true,
      render: (row: ConvenioListItem) => (
        <span className="text-sm text-gray-500">{formatDate(row.created_at)}</span>
      ),
    },
    ...(canEdit
      ? [
          {
            key: "actions",
            label: "",
            render: (row: ConvenioListItem) => (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => router.push(`/convenios/${row.id}/editar`)}
                  className="p-1.5 rounded-btn hover:bg-[#F6F7F9] text-[#667085] hover:text-[#1D4ED8] transition-colors"
                  title="Editar"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteId(row.id)}
                  className="p-1.5 rounded-btn hover:bg-[#FEE4E2] text-[#667085] hover:text-[#B42318] transition-colors"
                  title="Excluir"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ),
          } as any,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Convênios"
        description="Gerencie todos os convênios e acompanhe seus fluxos"
        actions={
          <Link href="/convenios/novo">
            <Button icon={Plus}>Novo Convênio</Button>
          </Link>
        }
        breadcrumbs={[{ label: "Convênios" }]}
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
                placeholder="Buscar por título, protocolo..."
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
        </div>
      </div>

      <DataTable
        columns={columns as any}
        data={convenios as any}
        loading={loading}
        onRowClick={(row: any) => router.push(`/convenios/${row.id}`)}
        emptyState={
          <EmptyState
            icon="file-text"
            title="Nenhum convênio encontrado"
            description="Você ainda não possui convênios cadastrados ou nenhum corresponde aos filtros."
            action={
              !search && !statusFilter && !tipoFilter
                ? { label: "Criar primeiro convênio", href: "/convenios/novo" }
                : undefined
            }
          />
        }
        pagination={
          total > 0
            ? {
                page: Math.floor(skip / PAGE_SIZE) + 1,
                total,
                pageSize: PAGE_SIZE,
                onChange: (page: number) => setSkip((page - 1) * PAGE_SIZE),
              }
            : undefined
        }
      />
      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          setDeleting(true);
          try {
            await api.deleteConvenio(deleteId);
            notify.success("Convênio excluído!");
            setDeleteId(null);
            load();
          } catch (e: any) {
            notify.error(e.message || "Erro ao excluir");
          } finally {
            setDeleting(false);
          }
        }}
        title="Excluir convênio"
        message="Tem certeza que deseja excluir este convênio?"
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  );
}
