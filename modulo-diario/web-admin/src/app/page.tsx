"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Upload, Search } from "lucide-react";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { MATTER_STATUSES, EDITION_STATUSES } from "@/lib/statusConfig";
import AdminShell from "@/components/AdminShell";

interface DashboardData {
  editions?: { total: number; draft: number; published: number; signed: number; pdf_generated: number; reviewing?: number };
  matters?: { total: number; draft: number; review: number; approved: number; published: number; rejected?: number };
  health?: { uptime_seconds: number };
}

function Kpi({ label, value, icon, to, accent }: { label: string; value: number | string; icon: React.ReactNode; to: string; accent: string }) {
  return (
    <Link href={to} className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`} aria-hidden="true">{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold text-gray-900">{value}</span>
        <span className="block text-sm text-gray-600">{label}</span>
      </span>
    </Link>
  );
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRaw<DashboardData>("/operations/dashboard")
      .then(setData)
      .catch((err) => notifyError("Dashboard", err))
      .finally(() => setLoading(false));
  }, []);

  const m = data.matters;
  const e = data.editions;

  const flowMatters = [
    { code: "draft", value: m?.draft ?? 0 },
    { code: "review", value: m?.review ?? 0 },
    { code: "approved", value: m?.approved ?? 0 },
    { code: "published", value: m?.published ?? 0 },
  ];
  const flowEditions = [
    { code: "draft", value: e?.draft ?? 0 },
    { code: "reviewing", value: e?.reviewing ?? 0 },
    { code: "pdf_generated", value: e?.pdf_generated ?? 0 },
    { code: "signed", value: e?.signed ?? 0 },
    { code: "published", value: e?.published ?? 0 },
  ];

  const quickActions = [
    { label: "Nova matéria", href: "/matters/new", icon: <Plus size={18} /> },
    { label: "Nova edição", href: "/editions/new", icon: <FileText size={18} /> },
    { label: "Importar publicação", href: "/importar", icon: <Upload size={18} /> },
    { label: "Verificar PDF", href: "/verify", icon: <Search size={18} /> },
  ];

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-gray-500">Carregando visão geral…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Visão geral</h1>
        <p className="mt-1 text-sm text-gray-600">Acompanhe o andamento editorial e as pendências do Diário Oficial.</p>
      </header>

      {/* Indicadores de pendência */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores principais">
        <Kpi label="Matérias aguardando revisão" value={m?.review ?? 0} to="/matters?status=review" accent="bg-amber-100 text-amber-800" icon={<FileText size={20} aria-hidden="true" />} />
        <Kpi label="Matérias devolvidas" value={m?.rejected ?? 0} to="/matters?status=rejected" accent="bg-red-100 text-red-700" icon={<FileText size={20} aria-hidden="true" />} />
        <Kpi label="Edições aguardando PDF" value={e?.pdf_generated ?? 0} to="/editions" accent="bg-blue-100 text-blue-700" icon={<FileText size={20} aria-hidden="true" />} />
        <Kpi label="Edições aguardando assinatura" value={e?.signed ?? 0} to="/editions" accent="bg-teal-100 text-teal-700" icon={<FileText size={20} aria-hidden="true" />} />
      </section>

      {/* Fluxo */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Fluxo — Matérias</h2>
          <div className="space-y-2">
            {flowMatters.map((f) => {
              const def = MATTER_STATUSES[f.code as keyof typeof MATTER_STATUSES];
              const Icon = def.icon;
              return (
                <div key={f.code} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-700"><Icon size={16} aria-hidden="true" />{def.label}</span>
                  <span className="font-bold text-gray-900">{f.value}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Fluxo — Edições</h2>
          <div className="space-y-2">
            {flowEditions.map((f) => {
              const def = EDITION_STATUSES[f.code as keyof typeof EDITION_STATUSES];
              const Icon = def.icon;
              return (
                <div key={f.code} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-gray-700"><Icon size={16} aria-hidden="true" />{def.label}</span>
                  <span className="font-bold text-gray-900">{f.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Ações rápidas */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Ações rápidas">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Ações rápidas</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">
              {a.icon}{a.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AdminShell>
      <DashboardContent />
    </AdminShell>
  );
}
