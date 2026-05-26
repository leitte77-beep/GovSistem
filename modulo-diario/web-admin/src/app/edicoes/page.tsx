"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/api";
import { formatDate, statusColor, statusLabel } from "@/lib/utils";

interface Edition {
  id: number;
  title: string;
  number?: string;
  year?: number;
  type: string;
  status: string;
  edition_date: string;
}

export default function EdicoesPage() {
  const router = useRouter();
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("per_page", "100");
      if (search) params.set("search", search);
      if (yearFilter) params.set("year", yearFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await api<{ data: Edition[] }>(`/editions?${params.toString()}`);
      setEditions(res.data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar edições");
    } finally {
      setLoading(false);
    }
  }, [search, yearFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleWorkflow(id: number, action: string) {
    try {
      await api(`/editions/${id}/${action}`, { method: "POST" });
      toast.success("Ação executada com sucesso");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao executar ação");
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/editions/${deleteId}`, { method: "DELETE" });
      toast.success("Edição excluída");
      setDeleteId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: "number",
      header: "Número/Ano",
      render: (e: Edition) => (
        <span className="font-medium">
          {e.number ? `Nº ${e.number}` : `#${e.id}`}{e.year ? ` / ${e.year}` : ""}
        </span>
      ),
    },
    {
      key: "title",
      header: "Título",
      render: (e: Edition) => <span className="font-medium text-gray-900">{e.title}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      render: (e: Edition) => {
        const labels: Record<string, string> = { normal: "Normal", extra: "Extra", suplementar: "Suplementar" };
        return labels[e.type] || e.type;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (e: Edition) => (
        <Badge className={statusColor(e.status)}>{statusLabel(e.status)}</Badge>
      ),
    },
    {
      key: "edition_date",
      header: "Data Publicação",
      render: (e: Edition) => (
        <span>{e.edition_date ? formatDate(e.edition_date) : "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      render: (e: Edition) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(ev) => { ev.stopPropagation(); router.push(`/edicoes/${e.id}/edit`); }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(ev) => { ev.stopPropagation(); setDeleteId(e.id); }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
      className: "w-24",
    },
  ];

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  return (
    <AppLayout title="Edições">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar edições..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
        >
          <option value="">Todos Anos</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
        >
          <option value="">Todos Status</option>
          <option value="draft">Rascunho</option>
          <option value="open">Aberto</option>
          <option value="closed">Fechado</option>
          <option value="published">Publicado</option>
          <option value="cancelled">Cancelado</option>
        </select>

        <button
          onClick={() => router.push("/edicoes/new")}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Edição
        </button>
      </div>

      <Card>
        <Table
          columns={columns}
          data={editions}
          loading={loading}
          emptyMessage="Nenhuma edição encontrada."
        />
      </Card>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Confirmar Exclusão" size="sm">
        <p className="text-sm text-gray-600">Tem certeza que deseja excluir esta edição?</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setDeleteId(null)}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
