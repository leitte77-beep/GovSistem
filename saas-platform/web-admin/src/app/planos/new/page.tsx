"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2, X } from "lucide-react";
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

export default function NewPlanPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", slug: "", description: "",
    max_orgs: 1, max_users: 10, max_storage_gb: 1,
    cycle: "monthly", price_cents: 0, setup_fee_cents: 0, trial_days: 0,
    custom_domain: false, white_label: false, api_access: false,
    priority_support: false, is_active: true, is_public: true,
    allowed_module_ids: [] as string[],
  });
  const [modules, setModules] = useState<Module[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ data: Module[] }>("/modules").then((r) => setModules(r.data)).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (type === "number") {
      setForm((prev) => ({ ...prev, [name]: Number(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const toggleModule = (modId: string) => {
    setForm((prev) => ({
      ...prev,
      allowed_module_ids: prev.allowed_module_ids.includes(modId)
        ? prev.allowed_module_ids.filter((m) => m !== modId)
        : [...prev.allowed_module_ids, modId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/plans", { method: "POST", body: form });
      toast.success("Plano criado com sucesso!");
      router.push("/planos");
    } catch (err: any) { toast.error(err.message || "Erro ao criar plano"); }
    finally { setSaving(false); }
  };

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm";

  return (
    <AppLayout title="Novo Plano">
      <div className="max-w-3xl">
        <form onSubmit={handleSubmit}>
          <Card title="Dados do Plano">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label><input name="name" value={form.name} onChange={handleChange} required className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label><input name="slug" value={form.slug} onChange={handleChange} required className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label><textarea name="description" value={form.description} onChange={handleChange} rows={3} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Orgaos</label><input name="max_orgs" type="number" value={form.max_orgs} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Usuarios</label><input name="max_users" type="number" value={form.max_users} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Storage (GB)</label><input name="max_storage_gb" type="number" value={form.max_storage_gb} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Ciclo</label><select name="cycle" value={form.cycle} onChange={handleChange} className={inputClass}>{cycles.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Preco (centavos)</label><input name="price_cents" type="number" value={form.price_cents} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Taxa de Setup (centavos)</label><input name="setup_fee_cents" type="number" value={form.setup_fee_cents} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Dias de Trial</label><input name="trial_days" type="number" value={form.trial_days} onChange={handleChange} className={inputClass} /></div>
            </div>
          </Card>

          <Card title="Modulos Permitidos" className="mt-6">
            <div className="flex flex-wrap gap-2">
              {modules.map((mod) => {
                const selected = form.allowed_module_ids.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleModule(mod.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      selected
                        ? "bg-primary-50 border-primary-300 text-primary-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {mod.name}
                    {selected && <X size={14} />}
                  </button>
                );
              })}
              {modules.length === 0 && <p className="text-sm text-gray-400">Nenhum modulo encontrado.</p>}
            </div>
          </Card>

          <Card title="Features" className="mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { key: "custom_domain", label: "Dominio Customizado" },
                { key: "white_label", label: "White Label" },
                { key: "api_access", label: "Acesso API" },
                { key: "priority_support", label: "Suporte Prioritario" },
                { key: "is_active", label: "Ativo" },
                { key: "is_public", label: "Publico" },
              ].map((feat) => (
                <label key={feat.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name={feat.key} checked={(form as any)[feat.key]} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-gray-700">{feat.label}</span>
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
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
