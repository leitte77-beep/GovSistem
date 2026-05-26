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

interface Plan {
  id: string;
  name: string;
}

export default function NewAssinaturaPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    organization_id: "",
    plan_id: "",
    auto_renew: true,
  });
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ data: Organization[] }>("/organizations?limit=500"),
      api<{ data: Plan[] }>("/plans?is_active=true"),
    ]).then(([orgRes, planRes]) => {
      setOrgs(orgRes.data);
      setPlans(planRes.data);
    }).catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
      await api("/subscriptions", { method: "POST", body: form });
      toast.success("Assinatura criada com sucesso!");
      router.push("/assinaturas");
    } catch (err: any) { toast.error(err.message || "Erro ao criar assinatura"); }
    finally { setSaving(false); }
  };

  const selectClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm bg-white";

  return (
    <AppLayout title="Nova Assinatura">
      <div className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <Card title="Dados da Assinatura">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orgao *</label>
                <select name="organization_id" value={form.organization_id} onChange={handleChange} required className={selectClass}>
                  <option value="">Selecione um orgao...</option>
                  {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plano *</label>
                <select name="plan_id" value={form.plan_id} onChange={handleChange} required className={selectClass}>
                  <option value="">Selecione um plano...</option>
                  {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="auto_renew" checked={form.auto_renew} onChange={handleChange} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Auto-renovar</span>
              </label>
            </div>
          </Card>

          <div className="flex items-center gap-3 mt-6">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar
            </button>
            <Link href="/assinaturas" className="flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              <ArrowLeft size={18} /> Cancelar
            </Link>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
