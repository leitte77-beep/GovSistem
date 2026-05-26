"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table } from "@/components/ui/Table";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";
import api from "@/lib/api";

interface OrgUnit {
  id: number;
  name: string;
  slug: string;
  parent?: { id: number; name: string } | null;
}

export default function UnidadesPage() {
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrgUnit | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: OrgUnit[] }>("/org-units");
      setUnits(res.data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setParentId("");
    setModalOpen(true);
  }

  function openEdit(item: OrgUnit) {
    setEditing(item);
    setName(item.name);
    setSlug(item.slug);
    setParentId(item.parent ? String(item.parent.id) : "");
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !slug) {
      toast.error("Nome e slug são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = { name, slug };
      if (parentId) body.parent_id = parentId;
      if (editing) {
        await api(`/org-units/${editing.id}`, { method: "PUT", body });
        toast.success("Unidade atualizada");
      } else {
        await api("/org-units", { method: "POST", body });
        toast.success("Unidade criada");
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/org-units/${deleteId}`, { method: "DELETE" });
      toast.success("Excluído");
      setDeleteId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    { key: "name", header: "Nome", render: (u: OrgUnit) => <span className="font-medium text-gray-900">{u.name}</span> },
    { key: "slug", header: "Slug" },
    {
      key: "parent",
      header: "Unidade Pai",
      render: (u: OrgUnit) => u.parent?.name || "—",
    },
    {
      key: "actions",
      header: "Ações",
      render: (u: OrgUnit) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(u); }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(u.id); }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
      className: "w-20",
    },
  ];

  return (
    <AppLayout title="Unidades">
      <div className="mb-6">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Unidade
        </button>
      </div>

      <Card>
        <Table columns={columns} data={units} loading={loading} emptyMessage="Nenhuma unidade encontrada." />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Unidade" : "Nova Unidade"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (!editing) setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-")); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unidade Pai</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Nenhuma (raiz)</option>
              {units.filter((u) => u.id !== editing?.id).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Confirmar Exclusão" size="sm">
        <p className="text-sm text-gray-600">Tem certeza que deseja excluir esta unidade?</p>
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
