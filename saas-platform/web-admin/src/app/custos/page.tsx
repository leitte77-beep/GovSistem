"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Modal from "@/components/ui/Modal";
import { Plus, Pencil, Save, Loader2, Trash2 } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/utils";

interface CostCenter {
  id: string;
  code: string;
  name: string;
  description: string | null;
  manager_name: string | null;
  budget_cents: number | null;
  is_active: boolean;
}

export default function CustosPage() {
  const [items, setItems] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "", manager_name: "", budget: "" });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try { setItems(await api("/cost-centers")); }
    catch { toast.error("Erro ao carregar centros de custo"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openNew = () => {
    setEditId(null); setForm({ code: "", name: "", description: "", manager_name: "", budget: "" }); setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name) { toast.error("Código e nome são obrigatórios"); return; }
    setSaving(true);
    try {
      const body: any = { code: form.code, name: form.name, description: form.description || undefined, manager_name: form.manager_name || undefined };
      if (form.budget) body.budget_cents = Math.round(parseFloat(form.budget.replace(",", ".")) * 100);
      if (editId) {
        await api(`/cost-centers/${editId}`, { method: "PUT", body });
        toast.success("Centro de custo atualizado!");
      } else {
        await api("/cost-centers", { method: "POST", body });
        toast.success("Centro de custo criado!");
      }
      setShowForm(false); fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao salvar"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover centro de custo?")) return;
    try { await api(`/cost-centers/${id}`, { method: "DELETE" }); toast.success("Removido"); fetchItems(); }
    catch (err: any) { toast.error(err.message || "Erro"); }
  };

  const columns: Column<CostCenter>[] = [
    { key: "code", label: "Código" },
    { key: "name", label: "Nome" },
    { key: "manager_name", label: "Responsável", render: (v: string | null) => v || "-" },
    { key: "budget_cents", label: "Orçamento", render: (v: number | null) => v ? formatCurrency(v) : "-" },
    { key: "is_active", label: "Ativo", render: (v: boolean) => v ? "✅" : "❌" },
    { key: "actions", label: "", render: (_: any, row: CostCenter) => (
      <div className="flex gap-2">
        <button onClick={() => { setEditId(row.id); setForm({ code: row.code, name: row.name, description: row.description || "", manager_name: row.manager_name || "", budget: row.budget_cents ? (row.budget_cents / 100).toFixed(2) : "" }); setShowForm(true); }}
          className="p-2 text-gray-500 hover:text-primary-600 rounded-lg"><Pencil size={16} /></button>
        <button onClick={() => handleDelete(row.id)}
          className="p-2 text-gray-500 hover:text-red-600 rounded-lg"><Trash2 size={16} /></button>
      </div>
    )},
  ];

  return (
    <AppLayout title="Centros de Custo">
      <Card>
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{items.length} centros</p>
          <button onClick={openNew} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary-700">
            <Plus size={16} /> Novo Centro
          </button>
        </div>
        <Table columns={columns} data={items} loading={loading} />
      </Card>
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? "Editar Centro" : "Novo Centro de Custo"} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
              <input value={form.code} onChange={(e) => setForm({...form, code: e.target.value})}
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input value={form.description} onChange={(e) => setForm({...form, description: e.target.value})}
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
              <input value={form.manager_name} onChange={(e) => setForm({...form, manager_name: e.target.value})}
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orçamento (R$)</label>
              <input value={form.budget} onChange={(e) => setForm({...form, budget: e.target.value})}
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" inputMode="decimal" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
