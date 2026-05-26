"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";
import api from "@/lib/api";

interface Credential {
  id: number;
  name: string;
  type: string;
  status: string;
}

export default function CredenciaisPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState("certificate");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Credential[] }>("/credentials");
      setCredentials(res.data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar credenciais");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      await api("/credentials", { method: "POST", body: { name, type } });
      toast.success("Credencial criada");
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/credentials/${deleteId}`, { method: "DELETE" });
      toast.success("Excluída");
      setDeleteId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    { key: "name", header: "Nome", render: (c: Credential) => <span className="font-medium text-gray-900">{c.name}</span> },
    {
      key: "type",
      header: "Tipo",
      render: (c: Credential) => {
        const labels: Record<string, string> = { certificate: "Certificado", key: "Chave", api_key: "API Key" };
        return labels[c.type] || c.type;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (c: Credential) => {
        const variant = c.status === "active" ? "success" : c.status === "expired" ? "danger" : "default";
        const label = c.status === "active" ? "Ativa" : c.status === "expired" ? "Expirada" : c.status;
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "Ações",
      render: (c: Credential) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          title="Excluir"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
      className: "w-16",
    },
  ];

  return (
    <AppLayout title="Credenciais">
      <div className="mb-6">
        <button
          onClick={() => { setName(""); setType("certificate"); setModalOpen(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Credencial
        </button>
      </div>

      <Card>
        <Table columns={columns} data={credentials} loading={loading} emptyMessage="Nenhuma credencial encontrada." />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Credencial">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da credencial"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            >
              <option value="certificate">Certificado</option>
              <option value="key">Chave</option>
              <option value="api_key">API Key</option>
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
              {saving ? "Salvando..." : "Criar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Confirmar Exclusão" size="sm">
        <p className="text-sm text-gray-600">Tem certeza que deseja excluir esta credencial?</p>
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
