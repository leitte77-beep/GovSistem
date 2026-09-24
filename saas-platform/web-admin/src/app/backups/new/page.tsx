"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface Organization {
  id: string;
  name: string;
}

const storageTypes = [
  { value: "s3", label: "S3 / Compatible" },
  { value: "azure", label: "Azure Blob" },
  { value: "local", label: "Local" },
];

export default function NewBackupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    organization_id: "",
    enabled: true,
    cron_expression: "0 2 * * *",
    retention_days: 30,
    storage_type: "s3",
    encrypt: true,
    notifications: false,
    emails: "",
  });
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ data: Organization[] }>("/organizations?limit=500").then((r) => setOrgs(r.data)).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (type === "number") {
      setForm((prev) => ({ ...prev, [name]: Number(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/backups/configs", { method: "POST", body: form });
      toast.success("Configuracao de backup criada com sucesso!");
      router.push("/backups");
    } catch (err: any) { toast.error(err.message || "Erro ao criar configuracao"); }
    finally { setSaving(false); }
  };

  const inputClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm";
  const selectClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm bg-white";

  return (
    <AppLayout title="Nova Config. Backup">
      <div className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card title="Dados do Backup">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input name="name" value={form.name} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orgao *</label>
                <select name="organization_id" value={form.organization_id} onChange={handleChange} required className={selectClass}>
                  <option value="">Selecione...</option>
                  {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cron Expression</label>
                <input name="cron_expression" value={form.cron_expression} onChange={handleChange} className={inputClass} placeholder="0 2 * * *" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Retencao (dias)</label>
                <input name="retention_days" type="number" value={form.retention_days} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Storage Type</label>
                <select name="storage_type" value={form.storage_type} onChange={handleChange} className={selectClass}>
                  {storageTypes.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emails (notificacao)</label>
                <input name="emails" value={form.emails} onChange={handleChange} className={inputClass} placeholder="admin@exemplo.com" />
              </div>
            </div>
            <div className="flex flex-wrap gap-6 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="enabled" checked={form.enabled} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Habilitado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="encrypt" checked={form.encrypt} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Criptografar</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="notifications" checked={form.notifications} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Notificacoes</span>
              </label>
            </div>
          </Card>

          <div className="flex items-center gap-3 mt-6">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar
            </button>
            <Link href="/backups" className="flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              <ArrowLeft size={18} /> Cancelar
            </Link>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
