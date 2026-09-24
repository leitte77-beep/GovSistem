"use client";
import React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { moduleVisual } from "@/components/module-card";
import { MODULE_NEWS } from "@/lib/novidades";
import { useAuth } from "@/lib/auth-provider";

export default function NovidadesIndexPage() {
  const { ctx } = useAuth();
  const slugs = Object.keys(MODULE_NEWS);
  const nameOf = (slug: string) =>
    ctx?.modules.find((m) => m.slug === slug)?.name ??
    slug.charAt(0).toUpperCase() + slug.slice(1);

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-4 sm:pb-6">
        <Link
          href="/dashboard"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
        >
          <ArrowLeft size={15} /> Voltar ao dashboard
        </Link>
        <h1 className="flex items-center gap-2 text-display text-ink">
          <Sparkles size={22} aria-hidden="true" /> Novidades
        </h1>
        <p className="mt-2 text-sm text-muted">
          O que mudou recentemente em cada módulo da plataforma.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2 [&>*]:min-w-0 sm:grid-cols-2 sm:gap-4">
        {slugs.map((slug) => {
          const news = MODULE_NEWS[slug];
          const visual = moduleVisual(slug);
          const Icon = visual.icon;
          return (
            <Link
              key={slug}
              href={`/novidades/${slug}`}
              className="group flex min-w-0 items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm transition hover:shadow-lg sm:p-4"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${visual.gradient}`}
              >
                <Icon size={18} className="text-white" />
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-on-surface">{nameOf(slug)}</h2>
                  <span className="shrink-0 rounded-lg bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    v{news.version}
                  </span>
                </div>
                <p className="truncate text-xs text-on-surface-variant">
                  {news.items.length} novidade(s) e {news.fixes.length} correção(ões)
                </p>
              </div>
              <ArrowRight
                size={18}
                className="shrink-0 text-primary-700 transition-transform group-hover:translate-x-1"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
