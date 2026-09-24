"use client";
import React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, type LucideIcon } from "lucide-react";
import { moduleVisual } from "@/components/module-card";

interface NewsCardProps {
  slug: string;
  name: string;
  description?: string | null;
  version: string;
  createdAt?: string | null;
}

export default function NewsCard({ slug, name, description, version, createdAt }: NewsCardProps) {
  const visual = moduleVisual(slug) as { icon: LucideIcon; gradient: string };
  const Icon = visual.icon;
  return (
    <Link
      href={`/novidades/${slug}`}
      className="group flex h-full flex-col rounded-xl border border-line bg-white p-5 shadow-card transition hover:border-ink/25 hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-paper text-ink">
          <Icon size={19} aria-hidden="true" />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
          <Sparkles size={10} aria-hidden="true" /> Novidade
        </span>
      </div>
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold leading-snug text-ink">{name}</h3>
        <span className="shrink-0 rounded-md bg-paper px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          v{version}
        </span>
      </div>
      <p className="flex-1 text-xs leading-relaxed text-muted line-clamp-3">
        {description || "Novo módulo disponível para o seu órgão."}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <span className="text-[11px] text-muted">
          {createdAt ? new Date(createdAt).toLocaleDateString("pt-BR") : "Recém-chegado"}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-ink group-hover:underline">
          Ver mais <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
