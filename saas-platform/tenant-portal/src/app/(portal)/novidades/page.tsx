"use client";
import React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronRight, Sparkles, type LucideIcon } from "lucide-react";
import { moduleVisual } from "@/components/module-card";
import { MODULE_NEWS, formatNewsDate } from "@/lib/novidades";
import { useAuth } from "@/lib/auth-provider";

export default function NovidadesIndexPage() {
  const { ctx } = useAuth();
  const contracted = new Set(ctx?.modules.map((m) => m.slug) ?? []);
  const nameOf = (slug: string) => ctx?.modules.find((m) => m.slug === slug)?.name ?? MODULE_NEWS[slug]?.name ?? slug;

  // Mais recentes primeiro; os módulos do órgão antes dos demais.
  const withNews = Object.entries(MODULE_NEWS).sort(
    ([a, na], [b, nb]) =>
      Number(contracted.has(b)) - Number(contracted.has(a)) || (nb.date ?? "").localeCompare(na.date ?? ""),
  );
  const withoutNews = (ctx?.modules ?? []).filter((m) => !MODULE_NEWS[m.slug]);

  return (
    <div className="space-y-8">
      <header>
        <nav aria-label="Trilha" className="mb-3 flex items-center gap-1 text-sm text-muted">
          <Link href="/dashboard" className="hover:text-ink hover:underline">
            Início
          </Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span className="font-medium text-ink" aria-current="page">
            Novidades
          </span>
        </nav>
        <h1 className="flex items-center gap-2 text-display text-ink">
          <Sparkles size={24} aria-hidden="true" /> Novidades
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          O que mudou em cada módulo da plataforma: recursos novos, correções e melhorias.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {withNews.map(([slug, news]) => {
          const visual = moduleVisual(slug);
          const Icon = visual.icon as LucideIcon;
          const date = formatNewsDate(news.date);
          return (
            <Link
              key={slug}
              href={`/novidades/${slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-pop"
            >
              <div className={`relative flex items-center gap-4 bg-gradient-to-br ${visual.gradient} px-5 py-4 text-white`}>
                <Icon
                  aria-hidden="true"
                  size={110}
                  strokeWidth={1}
                  className="pointer-events-none absolute -right-4 -top-5 opacity-10"
                />
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div className="relative min-w-0">
                  <h2 className="truncate text-base font-bold">{nameOf(slug)}</h2>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-white/80">
                    <span className="font-semibold text-white">v{news.version}</span>
                    {date && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays size={11} aria-hidden="true" /> {date}
                      </span>
                    )}
                  </p>
                </div>
                {contracted.has(slug) && (
                  <span className="relative ml-auto shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-white/25">
                    Seu órgão usa
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-sm leading-relaxed text-muted">{news.summary}</p>
                <ul className="mt-3 space-y-1.5">
                  {news.items.slice(0, 3).map((n) => {
                    const ItemIcon = n.icon;
                    return (
                      <li key={n.title} className="flex items-center gap-2 text-sm text-ink">
                        <ItemIcon size={14} className="shrink-0 text-muted" aria-hidden="true" />
                        <span className="truncate">{n.title}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-auto flex items-center justify-between pt-4 text-xs">
                  <span className="text-muted">
                    {news.items.length} novidades
                    {news.fixes.length > 0 && ` · ${news.fixes.length} correções`}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-ink">
                    Ver tudo <ArrowRight size={13} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {withoutNews.length > 0 && (
        <section aria-labelledby="sem-notas">
          <h2 id="sem-notas" className="mb-1 text-sm font-semibold text-ink">
            Outros módulos do seu órgão
          </h2>
          <p className="mb-3 text-xs text-muted">Ainda sem notas de versão publicadas.</p>
          <div className="flex flex-wrap gap-2">
            {withoutNews.map((m) => {
              const v = moduleVisual(m.slug);
              const MIcon = v.icon as LucideIcon;
              return (
                <Link
                  key={m.slug}
                  href={`/novidades/${m.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-3 text-sm text-ink shadow-card transition hover:border-ink/25"
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${v.gradient}`}>
                    <MIcon size={13} className="text-white" aria-hidden="true" />
                  </span>
                  {m.name}
                  <span className="text-xs text-muted">v{m.version}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
