"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface Plan {
  id: string;
  name: string;
}

interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  auto_renew: boolean;
  plan: Plan | null;
}

export default function EditAssinaturaPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [form, setForm] = useState({ plan_id: "", status: "", auto_renew: true });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ data: Plan[] }>("/plans?is_active=true"),
      api<Subscription>(`/subscriptions/${id}`),
    ]).then(([planRes, sub]) => {
      setPlans(planRes.data);
      setForm({ plan_id: sub.plan_id, status: sub.status, auto_renew: sub.auto_renew });
    }).catch(() => toast.error("Erro ao carregar dados"))
    .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/subscriptions/${id}`, { method: "PUT", body: form });
      toast.success("Assinatura atualizada com sucesso!");
      router.push("/assinaturas");
    } catch (err: any) { toast.error(err.message || "Erro ao atualizar"); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <AppLayout title="Editar Assinatura">
      <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
    </AppLayout>;
  }

  const selectClass = "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white";

  return (
    <AppLayout title="Editar Assinatura">
      <div className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <Card title="Editar Assinatura">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plano *</label>
                <select value={form.plan_id} onChange={(e) => setForm((prev) => ({ ...prev, plan_id: e.target.value }))} required className={selectClass}>
                  <option value="">Selecione um plano...</option>
                  {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} className={selectClass}>
                  <option value="active">Ativa</option>
                  <option value="trial">Trial</option>
                  <option value="paused">Pausada</option>
                  <option value="cancelled">Cancelada</option>
                  <option value="expired">Expirada</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.auto_renew} onChange={(e) => setForm((prev) => ({ ...prev, auto_renew: e.target.checked }))}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Auto-renovar</span>
              </label>
            </div>
          </Card>
          <div className="flex items-center gap-3 mt-6">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar
            </button>
            <Link href="/assinaturas"
              className="flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              <ArrowLeft size={18} /> Cancelar
            </Link>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
