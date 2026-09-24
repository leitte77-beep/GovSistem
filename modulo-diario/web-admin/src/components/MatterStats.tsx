"use client";

/** Status filtrável a partir dos cards. "" = Total (limpa o filtro). */
export type MatterStatFilter = "" | "published" | "draft" | "review" | "rejected";

interface MatterStatsProps {
  total: number;
  published: number;
  draft: number;
  review: number;
  rejected: number;
  activeStatus: string;
  onSelect: (status: MatterStatFilter) => void;
  loading?: boolean;
}

interface StatCard {
  key: MatterStatFilter;
  label: string;
  value: number;
  icon: string;
  accent: string;
  valueClass: string;
  /** estado que exige ação — ganha destaque somente quando há itens. */
  attention?: boolean;
}

export default function MatterStats({
  total, published, draft, review, rejected, activeStatus, onSelect, loading,
}: MatterStatsProps) {
  const cards: StatCard[] = [
    { key: "", label: "Total", value: total, icon: "description", accent: "bg-primary", valueClass: "text-on-surface" },
    { key: "published", label: "Publicadas", value: published, icon: "task_alt", accent: "bg-secondary", valueClass: "text-secondary" },
    { key: "draft", label: "Rascunhos", value: draft, icon: "edit_note", accent: "bg-outline", valueClass: "text-on-surface-variant" },
    { key: "review", label: "Em revisão", value: review, icon: "rate_review", accent: "bg-status-review-text", valueClass: "text-status-review-text", attention: true },
    { key: "rejected", label: "Devolvidas", value: rejected, icon: "undo", accent: "bg-status-rejected-text", valueClass: "text-status-rejected-text", attention: true },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const active = activeStatus === card.key;
        const muted = card.value === 0;
        const valueClass = muted && card.attention ? "text-outline" : card.valueClass;
        const accent = muted ? "bg-outline-variant" : card.accent;

        return (
          <button
            key={card.key || "total"}
            type="button"
            onClick={() => onSelect(card.key)}
            aria-pressed={active}
            className={`group relative overflow-hidden rounded-2xl border bg-surface-container-lowest p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              active ? "border-primary ring-2 ring-primary/25" : "border-outline-variant"
            }`}
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden="true" />
            <span className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{card.label}</span>
              <span className={`material-symbols-outlined text-[20px] ${muted ? "text-outline-variant" : "text-outline"}`} aria-hidden="true">{card.icon}</span>
            </span>
            {loading ? (
              <span className="mt-2 block h-8 w-16 animate-pulse rounded bg-surface-container-high" />
            ) : (
              <span className={`mt-1 block text-3xl font-bold leading-9 tracking-tight ${valueClass}`}>
                {new Intl.NumberFormat("pt-BR").format(card.value)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
