"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Plus, Pencil, Trash2 } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  max_users: number;
  cycle: string;
  is_active: boolean;
}

export default function PlanosPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Plan[]>("/plans");
      setPlans(Array.isArray(res) ? res : (res as any).data || []);
    } catch { toast.error("Erro ao carregar planos"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/plans/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Plano excluido com sucesso!");
      setDeleteTarget(null);
      fetchPlans();
    } catch (err: any) { toast.error(err.message || "Erro ao excluir"); }
    finally { setDeleting(false); }
  };

  const columns: Column<Plan>[] = [
    { key: "name", label: "Nome", sortable: true },
    { key: "slug", label: "Slug", sortable: true },
    { key: "price_cents", label: "Preco", render: (v: number) => formatCurrency(v) },
    { key: "max_users", label: "Usuarios Max" },
    { key: "cycle", label: "Ciclo" },
    { key: "is_active", label: "Status", render: (v: boolean) => <Badge variant={v ? "success" : "danger"}>{v ? "Ativo" : "Inativo"}</Badge> },
    { key: "actions", label: "Acoes", render: (_: any, row: Plan) => (
      <div className="flex items-center gap-2">
        <button onClick={(e) => { e.stopPropagation(); router.push(`/planos/${row.id}/edit`); }} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Pencil size={16} /></button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
      </div>
    )},
  ];

  return (
    <AppLayout title="Planos">
      <Card>
        <div className="flex justify-end mb-6">
          <button onClick={() => router.push("/planos/new")} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Novo Plano
          </button>
        </div>
        <Table columns={columns} data={plans} loading={loading} />
      </Card>
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar Exclusao" size="sm">
        <p className="text-gray-600 mb-4">Tem certeza que deseja excluir o plano <strong>{deleteTarget?.name}</strong>?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir"}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
