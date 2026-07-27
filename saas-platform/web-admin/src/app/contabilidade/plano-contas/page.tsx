"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { BookOpen, Plus, Loader2 } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
  nature: string;
  parent_id: string | null;
  accepts_manual_entry: boolean;
  is_system: boolean;
  is_active: boolean;
}

const typeLabels: Record<string, string> = {
  asset: "Ativo",
  liability: "Passivo",
  equity: "Patrimonio Liquido",
  revenue: "Receita",
  expense: "Despesa",
  deduction: "Deducao",
  cost: "Custo",
};

const typeVariants: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  asset: "success",
  liability: "warning",
  equity: "info",
  revenue: "success",
  expense: "danger",
  deduction: "danger",
  cost: "default",
};

export default function PlanoContasPage() {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", account_type: "revenue", nature: "credit", parent_id: "" });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/chart-of-accounts?per_page=200";
      if (typeFilter) url += `&type=${typeFilter}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      const res = await api<{ data: Account[]; total: number }>(url);
      setItems(res.data);
    } catch { toast.error("Erro ao carregar plano de contas"); }
    finally { setLoading(false); }
  }, [typeFilter, search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api("/chart-of-accounts/seed", { method: "POST" });
      toast.success("Plano de contas padrao criado!");
      setShowSeed(false);
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao criar plano"); }
    finally { setSeeding(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name) { toast.error("Codigo e nome sao obrigatorios"); return; }
    setSaving(true);
    try {
      await api("/chart-of-accounts", {
        method: "POST",
        body: { ...form, parent_id: form.parent_id || undefined },
      });
      toast.success("Conta criada!");
      setShowCreate(false);
      setForm({ code: "", name: "", account_type: "revenue", nature: "credit", parent_id: "" });
      fetchItems();
    } catch (err: any) { toast.error(err.message || "Erro ao criar"); }
    finally { setSaving(false); }
  };

  const grouped = items.reduce((acc, item) => {
    const type = item.account_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {} as Record<string, Account[]>);

  return (
    <AppLayout title="Plano de Contas">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Plano de Contas</h2>
          <p className="text-sm text-gray-500">{items.length} contas cadastradas</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowSeed(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors">
            <BookOpen size={16} /> Seed Padrao
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Nova Conta
          </button>
        </div>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input type="text" placeholder="Buscar conta..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
            <option value="">Todos os tipos</option>
            {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-500">Nenhuma conta encontrada.</p>
            <p className="text-sm text-gray-400 mt-1">Use &quot;Seed Padrao&quot; para criar o plano automaticamente.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([type, accounts]) => (
              <div key={type}>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Badge variant={typeVariants[type] || "default"}>{typeLabels[type] || type}</Badge>
                  <span className="text-xs text-gray-400 font-normal">{accounts.length} contas</span>
                </h3>
                <div className="space-y-1">
                  {accounts.map((acc) => (
                    <div key={acc.id}
                      className="flex items-center justify-between px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm text-gray-500 w-20">{acc.code}</span>
                        <span className="text-sm font-medium text-gray-900">{acc.name}</span>
                        {acc.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">SISTEMA</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 capitalize">{acc.nature === "debit" ? "Devedora" : "Credora"}</span>
                        {!acc.is_active && <Badge variant="warning">Inativo</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showSeed} onClose={() => setShowSeed(false)} title="Criar Plano de Contas Padrao" size="sm">
        <p className="text-gray-600 mb-6">Isso criara o plano de contas padrao com 35 contas (Ativo, Passivo, Receita, Deducoes, Despesas).</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowSeed(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSeed} disabled={seeding}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {seeding ? <Loader2 size={14} className="animate-spin" /> : "Criar Plano"}
          </button>
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nova Conta Contabil" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codigo *</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="1.1.1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value, nature: ["asset", "deduction", "expense", "cost"].includes(e.target.value) ? "debit" : "credit" })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white">
                {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Nome da conta" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
