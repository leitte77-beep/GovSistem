"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Trash2, Loader2, X } from "lucide-react";
import Link from "next/link";

interface Module {
  id: string;
  name: string;
}

const cycles = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];

export default function EditPlanPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<any>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([api<any>(`/plans/${id}`), api<{ data: Module[] }>("/modules")])
      .then(([plan, modRes]) => {
        setForm({
          name: plan.name || "", slug: plan.slug || "", description: plan.description || "",
          max_orgs: plan.max_orgs ?? 1, max_users: plan.max_users ?? 10, max_storage_gb: plan.max_storage_gb ?? 1,
          cycle: plan.cycle || "monthly", price_cents: plan.price_cents ?? 0, setup_fee_cents: plan.setup_fee_cents ?? 0, trial_days: plan.trial_days ?? 0,
          custom_domain: plan.custom_domain ?? false, white_label: plan.white_label ?? false, api_access: plan.api_access ?? false,
          priority_support: plan.priority_support ?? false, is_active: plan.is_active ?? true, is_public: plan.is_public ?? true,
          allowed_module_ids: plan.allowed_module_ids || [],
        });
        setModules(modRes.data);
      })
      .catch(() => toast.error("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev: any) => prev ? { ...prev, [name]: (e.target as HTMLInputElement).checked } : prev);
    } else if (type === "number") {
      setForm((prev: any) => prev ? { ...prev, [name]: Number(value) } : prev);
    } else {
      setForm((prev: any) => prev ? { ...prev, [name]: value } : prev);
    }
  };

  const toggleModule = (modId: string) => {
    setForm((prev: any) => ({
      ...prev,
      allowed_module_ids: (prev.allowed_module_ids || []).includes(modId)
        ? prev.allowed_module_ids.filter((m: string) => m !== modId)
        : [...(prev.allowed_module_ids || []), modId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/plans/${id}`, { method: "PUT", body: form });
      toast.success("Plano atualizado com sucesso!");
      router.push("/planos");
    } catch (err: any) { toast.error(err.message || "Erro ao atualizar"); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/plans/${id}`, { method: "DELETE" });
      toast.success("Plano excluido com sucesso!");
      router.push("/planos");
    } catch (err: any) { toast.error(err.message || "Erro ao excluir"); }
    finally { setDeleting(false); setShowDelete(false); }
  };

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm";

  if (loading) return <AppLayout title="Editar Plano"><div className="flex justify-center py-16"><Spinner /></div></AppLayout>;
  if (!form) return <AppLayout title="Editar Plano"><p className="text-gray-500">Plano nao encontrado.</p></AppLayout>;

  return (
    <AppLayout title="Editar Plano">
      <div className="max-w-3xl">
        <form onSubmit={handleSubmit}>
          <Card title="Dados do Plano">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label><input name="name" value={form.name} onChange={handleChange} required className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label><input name="slug" value={form.slug} onChange={handleChange} required className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label><textarea name="description" value={form.description || ""} onChange={handleChange} rows={3} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Orgaos</label><input name="max_orgs" type="number" value={form.max_orgs} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Usuarios</label><input name="max_users" type="number" value={form.max_users} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Storage (GB)</label><input name="max_storage_gb" type="number" value={form.max_storage_gb} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Ciclo</label><select name="cycle" value={form.cycle} onChange={handleChange} className={inputClass}>{cycles.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Preco (centavos)</label><input name="price_cents" type="number" value={form.price_cents} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Taxa Setup (centavos)</label><input name="setup_fee_cents" type="number" value={form.setup_fee_cents} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Dias Trial</label><input name="trial_days" type="number" value={form.trial_days} onChange={handleChange} className={inputClass} /></div>
            </div>
          </Card>

          <Card title="Modulos Permitidos" className="mt-6">
            <div className="flex flex-wrap gap-2">
              {modules.map((mod) => {
                const selected = (form.allowed_module_ids || []).includes(mod.id);
                return (
                  <button key={mod.id} type="button" onClick={() => toggleModule(mod.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${selected ? "bg-primary-50 border-primary-300 text-primary-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  >
                    {mod.name} {selected && <X size={14} />}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Features" className="mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {["custom_domain", "white_label", "api_access", "priority_support", "is_active", "is_public"].map((key) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name={key} checked={!!form[key]} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-gray-700">{key === "custom_domain" ? "Dominio Customizado" : key === "white_label" ? "White Label" : key === "api_access" ? "Acesso API" : key === "priority_support" ? "Suporte Prioritario" : key === "is_active" ? "Ativo" : "Publico"}</span>
                </label>
              ))}
            </div>
          </Card>

          <div className="flex items-center gap-3 mt-6">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar
            </button>
            <Link href="/planos" className="flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              <ArrowLeft size={18} /> Cancelar
            </Link>
            <button type="button" onClick={() => setShowDelete(true)} className="flex items-center gap-2 border border-red-300 text-red-600 px-4 py-2.5 rounded-lg font-medium hover:bg-red-50 transition-colors ml-auto">
              <Trash2 size={18} /> Excluir
            </button>
          </div>
        </form>
      </div>
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Confirmar Exclusao" size="sm">
        <p className="text-gray-600 mb-4">Tem certeza que deseja excluir este plano?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir"}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
