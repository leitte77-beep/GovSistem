"use client";
import React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href?: string;
  tone?: "blue" | "violet" | "cyan" | "emerald" | "amber" | "red";
  hint?: string;
  loading?: boolean;
}

const TONE_STYLES: Record<NonNullable<KpiCardProps["tone"]>, { plate: string; value: string }> = {
  blue: { plate: "bg-paper text-ink", value: "text-ink" },
  violet: { plate: "bg-paper text-ink", value: "text-ink" },
  cyan: { plate: "bg-paper text-ink", value: "text-ink" },
  emerald: { plate: "bg-accent-soft text-accent-ink", value: "text-accent-ink" },
  amber: { plate: "bg-warning-soft text-warning-ink", value: "text-warning-ink" },
  red: { plate: "bg-danger-soft text-danger-ink", value: "text-danger-ink" },
};

export default function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "blue",
  hint,
  loading = false,
}: KpiCardProps) {
  const t = TONE_STYLES[tone];
  const content = (
    <div className="group flex h-full flex-col rounded-xl border border-line bg-white p-4 shadow-card transition hover:border-ink/25 hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${t.plate}`}>
          <Icon size={19} aria-hidden="true" />
        </span>
        {href && (
          <ArrowUpRight
            size={15}
            className="text-muted opacity-0 transition group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
      </div>
      {loading ? (
        <div className="h-7 w-16 animate-pulse rounded bg-paper" />
      ) : (
        <p className={`text-2xl font-bold leading-none tracking-tight ${t.value}`}>{value}</p>
      )}
      <p className="mt-1.5 text-xs font-medium text-muted">{label}</p>
      {hint && <p className="mt-1 text-[11px] font-semibold text-warning-ink">{hint}</p>}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block h-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }
  return content;
}
