"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export default function NewModuloPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", slug: "", description: "", icon: "",
    base_url: "", api_url: "", admin_url: "", public_url: "",
    is_active: true, version: "1.0.0",
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/modules", { method: "POST", body: form });
      toast.success("Modulo criado com sucesso!");
      router.push("/modulos");
    } catch (err: any) { toast.error(err.message || "Erro ao criar modulo"); }
    finally { setSaving(false); }
  };

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm";

  return (
    <AppLayout title="Novo Modulo">
      <div className="max-w-3xl">
        <form onSubmit={handleSubmit}>
          <Card title="Dados do Modulo">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label><input name="name" value={form.name} onChange={handleChange} required className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label><input name="slug" value={form.slug} onChange={handleChange} required className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label><textarea name="description" value={form.description} onChange={handleChange} rows={3} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Icone</label><input name="icon" value={form.icon} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Versao</label><input name="version" value={form.version} onChange={handleChange} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">URL Base</label><input name="base_url" value={form.base_url} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">API URL</label><input name="api_url" value={form.api_url} onChange={handleChange} className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Admin URL</label><input name="admin_url" value={form.admin_url} onChange={handleChange} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">URL Publica</label><input name="public_url" value={form.public_url} onChange={handleChange} className={inputClass} /></div>
            </div>
            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Ativo</span>
              </label>
            </div>
          </Card>

          <div className="flex items-center gap-3 mt-6">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar
            </button>
            <Link href="/modulos" className="flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              <ArrowLeft size={18} /> Cancelar
            </Link>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
