"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, FileText, Upload, Search, FilePenLine, Undo2, Signature,
  Send, CheckCircle2, ArrowRight, Newspaper, Inbox,
} from "lucide-react";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { MATTER_STATUSES, EDITION_STATUSES } from "@/lib/statusConfig";
import type { MatterListItem } from "@/types/matter";
import type { EditionListItem } from "@/types/edition";
import AdminShell from "@/components/AdminShell";

interface DashboardData {
  editions?: {
    total: number; draft: number; published: number; signed: number;
    pdf_generated: number; reviewing?: number;
  };
  matters?: {
    total: number; draft: number; review: number; approved: number;
    published: number; rejected?: number;
  };
}

/* ── formatação ─────────────────────────────────────────────────────── */

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const LONG_DATE = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});

/** "hoje", "ontem", "há 3 dias" — o operador pensa em dias, não em datas. */
function relativeDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(date)) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  return date.toLocaleDateString("pt-BR");
}

/** "a", "a e b", "a, b e c" — leitura natural em português. */
function joinPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/* ── blocos ─────────────────────────────────────────────────────────── */

/** Uma fila de trabalho. Zerada, fica discreta; com trabalho, chama atenção. */
function QueueCard({
  label, hint, value, to, icon, tone,
}: {
  label: string;
  hint: string;
  value: number;
  to: string;
  icon: React.ReactNode;
  tone: "attention" | "info" | "calm";
}) {
  const empty = value === 0;
  const accent = empty
    ? "bg-surface-container text-outline"
    : tone === "attention"
      ? "bg-amber-100 text-amber-800"
      : tone === "info"
        ? "bg-blue-100 text-blue-800"
        : "bg-teal-100 text-teal-800";

  return (
    <Link
      href={to}
      className={`group flex flex-col rounded-xl border bg-surface-container-lowest p-5 transition
        hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2
        focus-visible:outline-offset-2 focus-visible:outline-primary-container
        ${empty ? "border-outline-variant" : "border-outline-variant shadow-sm"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-lg p-2 ${accent}`} aria-hidden="true">{icon}</span>
        <span className={`text-4xl font-display leading-none ${empty ? "text-outline" : "text-on-surface"}`}>
          {value}
        </span>
      </div>
      <div className="mt-4">
        <div className="text-body-md font-semibold text-on-surface">{label}</div>
        <div className="mt-0.5 text-body-sm text-on-surface-variant">
          {empty ? "Nada pendente" : hint}
        </div>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-label-md uppercase tracking-wider text-on-surface-variant transition group-hover:text-on-surface">
        Abrir <ArrowRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}

const PIPELINE_TONES: Record<string, string> = {
  gray: "bg-slate-300", amber: "bg-amber-400", blue: "bg-blue-400",
  teal: "bg-teal-400", green: "bg-green-600", violet: "bg-violet-400",
  slate: "bg-slate-400", red: "bg-red-400",
};

/**
 * O fluxo editorial como uma trilha: a barra mostra de relance onde o
 * trabalho está acumulado, e cada etapa leva à sua própria lista filtrada.
 */
function Pipeline({
  title, caption, icon, steps, href,
}: {
  title: string;
  caption?: string;
  icon: React.ReactNode;
  steps: { code: string; label: string; value: number; color: string; to: string }[];
  href: string;
}) {
  // A barra resume apenas o que ainda está em andamento: publicadas são
  // acervo concluído e, se entrassem, diluiriam a parte acionável.
  const inflight = steps.filter((step) => step.code !== "published" && step.value > 0);
  const total = inflight.reduce((sum, step) => sum + step.value, 0);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-headline-sm font-semibold text-on-surface">
          <span className="text-primary-container" aria-hidden="true">{icon}</span>
          {title}
        </h2>
        <Link href={href} className="text-body-sm font-medium text-primary-container hover:underline">
          Ver todas
        </Link>
      </div>

      {caption && (
        <p className="-mt-3 mb-4 text-body-sm text-on-surface-variant">{caption}</p>
      )}

      {total > 0 && (
        <div
          className="mb-5 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container"
          role="img"
          aria-label={`Em andamento — ${inflight.map((s) => `${s.label}: ${s.value}`).join(", ")}`}
        >
          {inflight.map((step) => (
            <span
              key={step.code}
              className={PIPELINE_TONES[step.color] ?? "bg-slate-300"}
              style={{ width: `${(step.value / total) * 100}%` }}
            />
          ))}
        </div>
      )}

      <ul className="space-y-1">
        {steps.map((step) => (
          <li key={step.code}>
            <Link
              href={step.to}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-container-low"
            >
              <span className="flex items-center gap-2.5 text-body-md text-on-surface">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${PIPELINE_TONES[step.color] ?? "bg-slate-300"}`}
                  aria-hidden="true"
                />
                {step.label}
              </span>
              <span className={`text-body-lg font-semibold ${step.value ? "text-on-surface" : "text-outline"}`}>
                {step.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListCard({
  title, icon, href, linkLabel, emptyLabel, children, count,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  linkLabel: string;
  emptyLabel: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-headline-sm font-semibold text-on-surface">
          <span className="text-primary-container" aria-hidden="true">{icon}</span>
          {title}
        </h2>
        <Link href={href} className="text-body-sm font-medium text-primary-container hover:underline">
          {linkLabel}
        </Link>
      </div>
      {count === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-surface-container-low px-4 py-6 text-body-sm text-on-surface-variant">
          <CheckCircle2 size={18} className="text-secondary" aria-hidden="true" />
          {emptyLabel}
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant/60">{children}</ul>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto w-full max-w-container-max px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
      <div className="mb-8 h-9 w-64 animate-pulse rounded-lg bg-surface-container" />
      <div className="mb-10 grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-surface-container" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-xl bg-surface-container" />
        ))}
      </div>
      <span className="sr-only">Carregando visão geral…</span>
    </div>
  );
}

/* ── página ─────────────────────────────────────────────────────────── */

function DashboardContent() {
  const [data, setData] = useState<DashboardData>({});
  const [review, setReview] = useState<MatterListItem[]>([]);
  const [editions, setEditions] = useState<EditionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.getRaw<DashboardData>("/operations/dashboard"),
      api.listMatters({ status: "review", limit: 5 }),
      api.listEditions(),
    ])
      .then(([summary, matters, allEditions]) => {
        if (!active) return;
        if (summary.status === "fulfilled") setData(summary.value);
        else notifyError("Dashboard", summary.reason);
        if (matters.status === "fulfilled") setReview(matters.value ?? []);
        if (allEditions.status === "fulfilled") {
          setEditions(
            [...(allEditions.value ?? [])]
              .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
              .slice(0, 5),
          );
        }
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const m = data.matters;
  const e = data.editions;

  // As filas dizem o que FALTA fazer. Um PDF gerado é uma edição esperando
  // assinatura; uma edição assinada espera publicação — nomear pelo estado em
  // que ela está deixaria o operador sem saber qual é o próximo passo.
  const queues = [
    {
      label: "Matérias para revisar",
      hint: "Aguardando sua revisão",
      value: m?.review ?? 0,
      to: "/matters?status=review",
      icon: <FilePenLine size={22} aria-hidden="true" />,
      tone: "attention" as const,
    },
    {
      label: "Matérias devolvidas",
      hint: "Precisam de correção do autor",
      value: m?.rejected ?? 0,
      to: "/matters?status=rejected",
      icon: <Undo2 size={22} aria-hidden="true" />,
      tone: "attention" as const,
    },
    {
      label: "Edições para assinar",
      hint: "PDF pronto, falta assinar",
      value: e?.pdf_generated ?? 0,
      to: "/editions?status=pdf_generated",
      icon: <Signature size={22} aria-hidden="true" />,
      tone: "info" as const,
    },
    {
      label: "Edições para publicar",
      hint: "Assinadas, prontas para publicar",
      value: e?.signed ?? 0,
      to: "/editions?status=signed",
      icon: <Send size={22} aria-hidden="true" />,
      tone: "calm" as const,
    },
  ];

  const pending = queues.reduce((sum, q) => sum + q.value, 0);
  const activeQueues = queues.filter((q) => q.value > 0);
  const idleQueues = queues.filter((q) => q.value === 0);

  // As trilhas mostram os estados que NÃO são ação pendente — assim nenhum
  // número aparece duas vezes entre esta seção e "Precisa de atenção".
  const matterSteps = (["draft", "approved", "published"] as const).map((code) => {
    const def = MATTER_STATUSES[code];
    const values: Record<string, number> = {
      draft: m?.draft ?? 0,
      approved: m?.approved ?? 0, published: m?.published ?? 0,
    };
    return { code, label: def.label, value: values[code], color: def.color, to: `/matters?status=${code}` };
  });

  const editionSteps = (["draft", "reviewing", "published"] as const).map((code) => {
    const def = EDITION_STATUSES[code];
    const values: Record<string, number> = {
      draft: e?.draft ?? 0, reviewing: e?.reviewing ?? 0,
      published: e?.published ?? 0,
    };
    return { code, label: def.label, value: values[code], color: def.color, to: `/editions?status=${code}` };
  });

  const quickActions = [
    { label: "Nova matéria", href: "/matters/new", icon: <Plus size={18} aria-hidden="true" />, primary: true },
    { label: "Nova edição", href: "/editions/new", icon: <FileText size={18} aria-hidden="true" />, primary: false },
    { label: "Importar", href: "/importar", icon: <Upload size={18} aria-hidden="true" />, primary: false },
    { label: "Verificar PDF", href: "/verify", icon: <Search size={18} aria-hidden="true" />, primary: false },
  ];

  if (loading) return <Skeleton />;

  return (
    <div className="mx-auto w-full max-w-container-max animate-fade-up px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow mb-2">Visão geral</p>
          <h1 className="text-display text-primary">
            {greeting(now.getHours())}, Diário Oficial
          </h1>
          <p className="mt-1.5 text-body-lg text-on-surface-variant first-letter:uppercase">
            {LONG_DATE.format(now)}
            {" · "}
            {pending === 0
              ? "nenhuma pendência no fluxo"
              : `${pending} ${pending === 1 ? "item aguardando ação" : "itens aguardando ação"}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Ações rápidas">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-body-md font-semibold transition-colors ${
                action.primary
                  ? "bg-primary text-on-primary hover:bg-primary-container"
                  : "border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
              }`}
            >
              {action.icon}
              {action.label}
            </Link>
          ))}
        </div>
      </header>

      <section className="mb-10" aria-label="Pendências">
        <h2 className="eyebrow mb-3">
          Precisa de atenção
        </h2>
        {activeQueues.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
              {activeQueues.map((queue) => <QueueCard key={queue.label} {...queue} />)}
            </div>
            {idleQueues.length > 0 && (
              <p className="mt-3 text-body-sm text-on-surface-variant">
                Sem pendências em {joinPt(idleQueues.map((q) => q.label.toLowerCase()))}.
              </p>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-4 text-body-md text-on-surface-variant">
            <CheckCircle2 size={18} className="text-secondary" aria-hidden="true" />
            Tudo em dia — nenhuma pendência no fluxo.
          </p>
        )}
      </section>

      <section className="mb-10 grid grid-cols-1 gap-gutter lg:grid-cols-2" aria-label="Fluxo editorial">
        <Pipeline
          title="Matérias"
          caption="Acompanhamento e acervo — as ações pendentes ficam em “Precisa de atenção”."
          icon={<FileText size={20} aria-hidden="true" />}
          steps={matterSteps}
          href="/matters"
        />
        <Pipeline
          title="Edições"
          caption="Acompanhamento e acervo — as ações pendentes ficam em “Precisa de atenção”."
          icon={<Newspaper size={20} aria-hidden="true" />}
          steps={editionSteps}
          href="/editions"
        />
      </section>

      <section className="grid grid-cols-1 gap-gutter lg:grid-cols-2" aria-label="Atividade recente">
        <ListCard
          title="Aguardando revisão"
          icon={<Inbox size={20} aria-hidden="true" />}
          href="/matters?status=review"
          linkLabel="Ver fila"
          emptyLabel="Nenhuma matéria aguardando revisão."
          count={review.length}
        >
          {review.map((matter) => (
            <li key={matter.id}>
              <Link
                href={`/matters/${matter.id}`}
                className="flex items-center justify-between gap-4 px-1 py-3 transition-colors hover:bg-surface-container-low"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body-md font-medium text-on-surface">
                    {matter.title || "Sem título"}
                  </span>
                  <span className="block truncate text-body-sm text-on-surface-variant">
                    Enviada {relativeDay(matter.updated_at || matter.created_at)}
                  </span>
                </span>
                <ArrowRight size={16} className="shrink-0 text-outline" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ListCard>

        <ListCard
          title="Últimas edições"
          icon={<Newspaper size={20} aria-hidden="true" />}
          href="/editions"
          linkLabel="Ver todas"
          emptyLabel="Nenhuma edição criada ainda."
          count={editions.length}
        >
          {editions.map((edition) => {
            const def = EDITION_STATUSES[edition.status as keyof typeof EDITION_STATUSES];
            return (
              <li key={edition.id}>
                <Link
                  href={`/editions/${edition.id}`}
                  className="flex items-center justify-between gap-4 px-1 py-3 transition-colors hover:bg-surface-container-low"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-md font-medium text-on-surface">
                      Edição nº {edition.number}/{edition.year}
                    </span>
                    <span className="block truncate text-body-sm text-on-surface-variant">
                      {edition.item_count} {edition.item_count === 1 ? "publicação" : "publicações"}
                      {" · "}criada {relativeDay(edition.created_at)}
                    </span>
                  </span>
                  {def && (
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-label-md ${def.badge}`}>
                      {def.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ListCard>
      </section>
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
