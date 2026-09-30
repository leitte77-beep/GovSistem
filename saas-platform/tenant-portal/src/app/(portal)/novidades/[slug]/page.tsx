"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { moduleVisual } from "@/components/module-card";
import { MODULE_NEWS, formatNewsDate } from "@/lib/novidades";
import { useAuth } from "@/lib/auth-provider";
import { openModuleInNewTab } from "@/lib/open-module";

export default function NovidadesModuloPage() {
  const { slug } = useParams<{ slug: string }>();
  const key = Array.isArray(slug) ? slug[0] : slug;
  const { ctx } = useAuth();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const data = MODULE_NEWS[key];
  const mod = ctx?.modules.find((m) => m.slug === key);
  const name = mod?.name ?? data?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
  const visual = moduleVisual(key);
  const Icon = visual.icon as LucideIcon;
  const canOpen = !!mod?.authorized && mod.is_active;
  const date = formatNewsDate(data?.date);

  const open = async () => {
    setError("");
    setOpening(true);
    try {
      await openModuleInNewTab(key, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar o módulo");
    } finally {
      setOpening(false);
    }
  };

  // Outros módulos com notas publicadas, para navegar sem voltar à lista.
  const others = Object.entries(MODULE_NEWS).filter(([s]) => s !== key);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <nav aria-label="Trilha" className="flex items-center gap-1 text-sm text-muted">
        <Link href="/dashboard" className="hover:text-ink hover:underline">
          Início
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href="/novidades" className="hover:text-ink hover:underline">
          Novidades
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="truncate font-medium text-ink" aria-current="page">
          {name}
        </span>
      </nav>

      {/* Hero */}
      <header
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${visual.gradient} px-6 py-7 text-white shadow-pop sm:px-8 sm:py-9`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "20px 20px" }}
        />
        <Icon
          aria-hidden="true"
          size={220}
          strokeWidth={1}
          className="pointer-events-none absolute -bottom-12 -right-8 text-white opacity-[0.08]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Icon size={26} aria-hidden="true" />
            </span>
            <p className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-white/80">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-semibold text-white ring-1 ring-white/20">
                <Sparkles size={12} aria-hidden="true" /> Novidades
              </span>
              {data && <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold text-white ring-1 ring-white/20">Versão {data.version}</span>}
              {date && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays size={12} aria-hidden="true" /> {date}
                </span>
              )}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{name}</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/85 sm:text-base">
              {data?.summary ?? mod?.description ?? "Módulo da plataforma GovSistem."}
            </p>
          </div>
          {canOpen && (
            <button
              type="button"
              onClick={open}
              disabled={opening}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-card transition hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-80"
            >
              {opening ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <ExternalLink size={16} aria-hidden="true" />
              )}
              Abrir {name}
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
      )}

      {!data ? (
        <section className="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-paper text-muted">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Ainda não há notas desta versão</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            As novidades do {name} serão publicadas aqui assim que a próxima versão sair.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="novidades-titulo">
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 id="novidades-titulo" className="text-lg font-bold tracking-tight text-ink">
                O que há de novo
              </h2>
              <span className="text-xs text-muted">{data.items.length} novidades</span>
            </div>
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.items.map((n, i) => {
                const ItemIcon = n.icon;
                const featured = i === 0;
                return (
                  <li
                    key={n.title}
                    className={`group flex gap-4 rounded-2xl border border-line bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-pop ${
                      featured ? "sm:col-span-2 sm:items-center sm:p-6" : ""
                    }`}
                  >
                    <span
                      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${visual.gradient} ${
                        featured ? "h-14 w-14" : "h-11 w-11"
                      }`}
                    >
                      <ItemIcon size={featured ? 24 : 19} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      {featured && (
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Destaque</p>
                      )}
                      <h3 className={`font-semibold text-ink ${featured ? "text-base sm:text-lg" : "text-sm"}`}>{n.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{n.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {data.fixes.length > 0 && (
            <section aria-labelledby="correcoes-titulo">
              <h2 id="correcoes-titulo" className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
                <Wrench size={17} aria-hidden="true" /> Correções e melhorias
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-card">
                {data.fixes.map((c) => (
                  <li key={c} className="flex items-start gap-3 px-5 py-3.5">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <p className="text-sm text-ink">{c}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {others.length > 0 && (
        <section aria-labelledby="outros-titulo" className="border-t border-line pt-6">
          <h2 id="outros-titulo" className="mb-3 text-sm font-semibold text-muted">
            Novidades de outros módulos
          </h2>
          <div className="flex flex-wrap gap-2">
            {others.map(([s, n]) => {
              const v = moduleVisual(s);
              const OIcon = v.icon as LucideIcon;
              return (
                <Link
                  key={s}
                  href={`/novidades/${s}`}
                  className="group inline-flex items-center gap-2 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-3 text-sm font-medium text-ink shadow-card transition hover:border-ink/25"
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${v.gradient}`}>
                    <OIcon size={13} className="text-white" aria-hidden="true" />
                  </span>
                  {ctx?.modules.find((m) => m.slug === s)?.name ?? n.name}
                  <span className="text-xs text-muted">v{n.version}</span>
                  <ArrowRight size={13} className="text-muted transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
