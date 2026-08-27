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
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`relative h-20 bg-gradient-to-br ${visual.gradient}`}>
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ring-1 ring-white/30 backdrop-blur-sm">
          <Sparkles size={10} /> Novidade
        </span>
        <div className="absolute -bottom-4 left-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow ring-1 ring-outline-variant">
          <Icon size={18} className="text-primary-700" />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4 pt-6">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-on-surface leading-snug">{name}</h3>
          <span className="shrink-0 rounded-md bg-surface-container px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            v{version}
          </span>
        </div>
        <p className="flex-1 text-xs leading-relaxed text-on-surface-variant line-clamp-3">
          {description || "Novo módulo disponível para o seu órgão."}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
          <span className="text-[11px] text-on-surface-variant">
            {createdAt ? new Date(createdAt).toLocaleDateString("pt-BR") : "Recém-chegado"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 group-hover:underline">
            Ver mais <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
