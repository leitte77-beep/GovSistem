"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Upload, Search, FilePenLine, Undo2, PenLine } from "lucide-react";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { MATTER_STATUSES, EDITION_STATUSES } from "@/lib/statusConfig";
import AdminShell from "@/components/AdminShell";

interface DashboardData {
  editions?: { total: number; draft: number; published: number; signed: number; pdf_generated: number; reviewing?: number };
  matters?: { total: number; draft: number; review: number; approved: number; published: number; rejected?: number };
  health?: { uptime_seconds: number };
}

function SummaryCard({
  label,
  value,
  to,
  icon,
  iconWrap,
}: {
  label: string;
  value: number | string;
  to: string;
  icon: React.ReactNode;
  iconWrap: string;
}) {
  return (
    <Link
      href={to}
      className="block rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className={`rounded-lg p-2 ${iconWrap}`} aria-hidden="true">
          {icon}
        </div>
      </div>
      <div className="mb-1 text-display font-display text-on-surface">{value}</div>
      <div className="text-label-md font-label-md uppercase tracking-wider text-on-surface-variant">{label}</div>
    </Link>
  );
}

function FlowRow({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-outline-variant/50 bg-surface p-4 transition-colors hover:bg-surface-container-low">
      <div className="flex items-center gap-3">
        <span className="text-outline" aria-hidden="true">{icon}</span>
        <span className="text-body-md font-body-md text-on-surface">{label}</span>
      </div>
      <span className="text-headline-md font-headline-md text-on-surface">{value}</span>
    </div>
  );
}

function FlowCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <h2 className="text-headline-md font-headline-md mb-6 flex items-center gap-2 text-on-surface">
        <span className="text-primary-container" aria-hidden="true">{icon}</span>
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
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

  const summaryCards = [
    {
      label: "Matérias aguardando revisão",
      value: m?.review ?? 0,
      to: "/matters?status=review",
      icon: <FilePenLine size={24} aria-hidden="true" />,
      iconWrap: "text-primary-container bg-surface-container",
    },
    {
      label: "Matérias devolvidas",
      value: m?.rejected ?? 0,
      to: "/matters?status=rejected",
      icon: <Undo2 size={24} aria-hidden="true" />,
      iconWrap: "text-error bg-error-container",
    },
    {
      label: "Edições aguardando PDF",
      value: e?.pdf_generated ?? 0,
      to: "/editions",
      icon: <FileText size={24} aria-hidden="true" />,
      iconWrap: "text-secondary bg-secondary-container opacity-80",
    },
    {
      label: "Edições aguardando assinatura",
      value: e?.signed ?? 0,
      to: "/editions",
      icon: <PenLine size={24} aria-hidden="true" />,
      iconWrap: "text-on-primary-fixed-variant bg-primary-fixed",
    },
  ];

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
    { label: "Nova matéria", href: "/matters/new", icon: <Plus size={18} />, style: "bg-primary-container text-on-primary hover:bg-primary" },
    { label: "Nova edição", href: "/editions/new", icon: <FileText size={18} />, style: "bg-surface-container-high text-on-surface hover:bg-surface-variant border border-outline-variant" },
    { label: "Importar publicação", href: "/importar", icon: <Upload size={18} />, style: "bg-surface text-primary hover:bg-surface-container-low border border-primary" },
    { label: "Verificar PDF", href: "/verify", icon: <Search size={18} />, style: "bg-surface text-primary hover:bg-surface-container-low border border-primary" },
  ];

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-on-surface-variant">Carregando visão geral…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-container-max">
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-display font-display mb-2 text-on-surface">Visão Geral</h1>
          <p className="text-body-lg font-body-lg text-on-surface-variant">Acompanhamento operacional do Diário Oficial</p>
        </div>

        {/* Summary Cards */}
        <section className="mb-12 grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores principais">
          {summaryCards.map((c) => (
            <SummaryCard key={c.label} {...c} />
          ))}
        </section>

        {/* Flow Sections */}
        <section className="mb-12 grid grid-cols-1 gap-gutter lg:grid-cols-2" aria-label="Fluxo editorial">
          <FlowCard title="Fluxo — Matérias" icon={<FileText size={22} aria-hidden="true" />}>
            {flowMatters.map((f) => {
              const def = MATTER_STATUSES[f.code as keyof typeof MATTER_STATUSES];
              const Icon = def.icon;
              return <FlowRow key={f.code} label={def.label} value={f.value} icon={<Icon size={20} aria-hidden="true" />} />;
            })}
          </FlowCard>
          <FlowCard title="Fluxo — Edições" icon={<FileText size={22} aria-hidden="true" />}>
            {flowEditions.map((f) => {
              const def = EDITION_STATUSES[f.code as keyof typeof EDITION_STATUSES];
              const Icon = def.icon;
              return <FlowRow key={f.code} label={def.label} value={f.value} icon={<Icon size={20} aria-hidden="true" />} />;
            })}
          </FlowCard>
        </section>
      </div>

      {/* Quick Actions Bar */}
      <div className="sticky bottom-0 z-20 w-full border-t border-outline-variant bg-surface-container-lowest p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex max-w-container-max flex-wrap items-center justify-center gap-4 md:justify-end">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={`flex items-center gap-2 rounded-lg px-6 py-2.5 font-label-md transition-colors ${a.style}`}
            >
              {a.icon}
              {a.label}
            </Link>
          ))}
        </div>
      </div>
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
