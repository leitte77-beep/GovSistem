"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Eye, Pencil, Trash2, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/api";
import { formatDate, statusColor, statusLabel } from "@/lib/utils";

interface Matter {
  id: number;
  title: string;
  status: string;
  author: string;
  created_at: string;
  act_type?: { id: number; name: string };
  org_unit?: { id: number; name: string };
}

interface SelectOption {
  id: number;
  name: string;
}

export default function MateriasPage() {
  const router = useRouter();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actTypeFilter, setActTypeFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [actTypes, setActTypes] = useState<SelectOption[]>([]);
  const [units, setUnits] = useState<SelectOption[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("per_page", "100");
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (actTypeFilter) params.set("act_type_id", actTypeFilter);
      if (unitFilter) params.set("org_unit_id", unitFilter);

      const res = await api<{ data: Matter[] }>(`/matters?${params.toString()}`);
      setMatters(res.data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar matérias");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, actTypeFilter, unitFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    async function loadFilters() {
      try {
        const [atRes, unRes] = await Promise.all([
          api<{ data: SelectOption[] }>("/act-types"),
          api<{ data: SelectOption[] }>("/org-units"),
        ]);
        setActTypes(atRes.data || []);
        setUnits(unRes.data || []);
      } catch {}
    }
    loadFilters();
  }, []);

  async function handleWorkflow(id: number, action: string) {
    try {
      await api(`/matters/${id}/${action}`, { method: "POST" });
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
      await api(`/matters/${deleteId}`, { method: "DELETE" });
      toast.success("Matéria excluída");
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
      key: "title",
      header: "Título",
      render: (m: Matter) => (
        <span className="font-medium text-gray-900">{m.title}</span>
      ),
    },
    {
      key: "act_type",
      header: "Tipo de Ato",
      render: (m: Matter) => m.act_type?.name || "-",
    },
    {
      key: "status",
      header: "Status",
      render: (m: Matter) => (
        <Badge className={statusColor(m.status)}>{statusLabel(m.status)}</Badge>
      ),
    },
    {
      key: "org_unit",
      header: "Unidade",
      render: (m: Matter) => m.org_unit?.name || "-",
    },
    {
      key: "author",
      header: "Autor",
    },
    {
      key: "created_at",
      header: "Data",
      render: (m: Matter) => formatDate(m.created_at),
    },
    {
      key: "actions",
      header: "Ações",
      render: (m: Matter) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/materias/${m.id}/edit`); }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Ver / Editar"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(m.id); }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      ),
      className: "w-32",
    },
  ];

  return (
    <AppLayout title="Matérias">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar matérias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
        >
          <option value="">Todos Status</option>
          <option value="draft">Rascunho</option>
          <option value="review">Em Revisão</option>
          <option value="approved">Aprovado</option>
          <option value="published">Publicado</option>
          <option value="rejected">Rejeitado</option>
          <option value="archived">Arquivado</option>
        </select>

        <select
          value={actTypeFilter}
          onChange={(e) => setActTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
        >
          <option value="">Todos Tipos</option>
          {actTypes.map((at) => (
            <option key={at.id} value={at.id}>{at.name}</option>
          ))}
        </select>

        <select
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500"
        >
          <option value="">Todas Unidades</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <button
          onClick={() => router.push("/materias/new")}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Matéria
        </button>
      </div>

      <Card>
        <Table
          columns={columns}
          data={matters}
          loading={loading}
          emptyMessage="Nenhuma matéria encontrada."
        />
      </Card>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Confirmar Exclusão" size="sm">
        <p className="text-sm text-gray-600">Tem certeza que deseja excluir esta matéria? Esta ação não pode ser desfeita.</p>
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
