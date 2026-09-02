"use client";

interface MatterStatsProps {
  total: number;
  published: number;
  draft: number;
  review: number;
  loading?: boolean;
}

interface StatCard {
  label: string;
  value: number;
  valueClass: string;
  icon: string;
  accent: string;
  loading?: boolean;
}

function Card({ label, value, valueClass, icon, accent, loading }: StatCard) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden="true" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className="material-symbols-outlined text-[20px] text-outline" aria-hidden="true">{icon}</span>
      </div>
      {loading ? (
        <span className="mt-2 block h-8 w-16 animate-pulse rounded bg-surface-container-high" />
      ) : (
        <span className={`mt-1 block text-3xl font-bold leading-9 tracking-tight ${valueClass}`}>
          {new Intl.NumberFormat("pt-BR").format(value)}
        </span>
      )}
    </div>
  );
}

export default function MatterStats({ total, published, draft, review, loading }: MatterStatsProps) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card label="Total" value={total} valueClass="text-on-surface" icon="description" accent="bg-primary" loading={loading} />
      <Card label="Publicadas" value={published} valueClass="text-secondary" icon="task_alt" accent="bg-secondary" loading={loading} />
      <Card label="Rascunhos" value={draft} valueClass="text-on-surface-variant" icon="edit_note" accent="bg-outline" loading={loading} />
      <Card label="Em revisão" value={review} valueClass="text-status-review-text" icon="rate_review" accent="bg-status-review-text" loading={loading} />
    </div>
  );
}
