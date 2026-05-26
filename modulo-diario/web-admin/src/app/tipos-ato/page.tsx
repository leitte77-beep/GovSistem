"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";
import api from "@/lib/api";

interface ActType {
  id: number;
  name: string;
  slug: string;
  description: string;
  requires_org_unit: boolean;
}

export default function TiposAtoPage() {
  const [actTypes, setActTypes] = useState<ActType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActType | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [requiresOrgUnit, setRequiresOrgUnit] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: ActType[] }>("/act-types");
      setActTypes(res.data || []);
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
    setDescription("");
    setRequiresOrgUnit(false);
    setModalOpen(true);
  }

  function openEdit(item: ActType) {
    setEditing(item);
    setName(item.name);
    setSlug(item.slug);
    setDescription(item.description || "");
    setRequiresOrgUnit(item.requires_org_unit);
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
      const body = { name, slug, description, requires_org_unit: requiresOrgUnit };
      if (editing) {
        await api(`/act-types/${editing.id}`, { method: "PUT", body });
        toast.success("Tipo de ato atualizado");
      } else {
        await api("/act-types", { method: "POST", body });
        toast.success("Tipo de ato criado");
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
      await api(`/act-types/${deleteId}`, { method: "DELETE" });
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
    { key: "name", header: "Nome", render: (a: ActType) => <span className="font-medium text-gray-900">{a.name}</span> },
    { key: "slug", header: "Slug" },
    { key: "description", header: "Descrição" },
    {
      key: "requires_org_unit",
      header: "Requer Unidade",
      render: (a: ActType) => (
        <Badge variant={a.requires_org_unit ? "success" : "default"}>
          {a.requires_org_unit ? "Sim" : "Não"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      render: (a: ActType) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(a); }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(a.id); }}
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
    <AppLayout title="Tipos de Ato">
      <div className="mb-6">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Tipo de Ato
        </button>
      </div>

      <Card>
        <Table columns={columns} data={actTypes} loading={loading} emptyMessage="Nenhum tipo de ato encontrado." />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar Tipo de Ato" : "Novo Tipo de Ato"}>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={requiresOrgUnit}
              onChange={(e) => setRequiresOrgUnit(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Requer unidade
          </label>
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
        <p className="text-sm text-gray-600">Tem certeza que deseja excluir este tipo de ato?</p>
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
