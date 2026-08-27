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

const TONE_STYLES: Record<NonNullable<KpiCardProps["tone"]>, { bg: string; text: string; ring: string; bar: string }> = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-100", bar: "from-blue-500 to-blue-300" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100", bar: "from-violet-500 to-violet-300" },
  cyan: { bg: "bg-cyan-50", text: "text-cyan-600", ring: "ring-cyan-100", bar: "from-cyan-500 to-cyan-300" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100", bar: "from-emerald-500 to-emerald-300" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100", bar: "from-amber-500 to-amber-300" },
  red: { bg: "bg-red-50", text: "text-red-600", ring: "ring-red-100", bar: "from-red-500 to-red-300" },
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
    <div className="group relative h-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${t.bar} opacity-70`} />
      <div className="mb-3 flex items-center justify-between">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${t.bg} ${t.text} ${t.ring}`}>
          <Icon size={19} />
        </div>
        {href && (
          <ArrowUpRight
            size={14}
            className="text-on-surface-variant opacity-0 transition group-hover:opacity-100"
          />
        )}
      </div>
      {loading ? (
        <div className="h-7 w-16 animate-pulse rounded bg-surface-container" />
      ) : (
        <p className="text-2xl font-bold leading-none tracking-tight text-on-surface">{value}</p>
      )}
      <p className="mt-1.5 text-xs text-on-surface-variant">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-on-surface-variant/80">{hint}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-xl">
        {content}
      </Link>
    );
  }
  return content;
}
