"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Blocks,
  ShieldCheck,
  UserPlus,
  ScrollText,
  AlertTriangle,
  Star,
  Building2,
  Sparkles,
  KeyRound,
  UserCog,
  ArrowUpRight,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Lock,
  Search,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import type { ModuleCard as ModuleCardData } from "@/lib/auth-provider";
import { moduleVisual } from "@/components/module-card";
import EmptyState from "@/components/empty-state";
import ActivityFeed, { type ActivityEvent } from "@/components/activity-feed";
import { formatDate } from "@/lib/format";
import { MODULE_NEWS } from "@/lib/novidades";
import { openModuleInNewTab } from "@/lib/open-module";

interface DashboardData {
  organization: { name: string; slug: string };
  counts: {
    users_total: number;
    users_active: number;
    users_suspended?: number;
    managers_active: number;
    modules_contracted: number;
    grants_total: number;
    grants_pending_review: number;
  };
  recent_activity: ActivityEvent[];
  news: Array<{
    slug: string;
    name: string;
    description?: string | null;
    version: string;
    created_at?: string | null;
  }>;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function firstName(name?: string) {
  if (!name) return "";
  return name.trim().split(/\s+/)[0];
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function DashboardPage() {
  const { ctx } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gov_favorite_modules");
      if (stored) setFavorites(JSON.parse(stored));
    } catch {
      /* armazenamento indisponível: segue sem favoritos */
    }
  }, []);

  const toggleFavorite = (slug: string) => {
    setFavorites((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      try {
        localStorage.setItem("gov_favorite_modules", JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  };

  const openModule = async (m: ModuleCardData) => {
    setError("");
    setOpening(m.slug);
    try {
      await openModuleInNewTab(m.slug, m.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar o módulo");
    } finally {
      setOpening(null);
    }
  };

  useEffect(() => {
    if (ctx?.user.is_manager) {
      api<DashboardData>("/tenant/dashboard")
        .then(setData)
        .catch((e) => setError(e.message));
    }
  }, [ctx?.user.is_manager]);

  const isManager = !!ctx?.user.is_manager;
  const counts = data?.counts;
  const authorizedModules = useMemo(() => (ctx?.modules ?? []).filter((m) => m.authorized), [ctx?.modules]);

  const shownModules = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? authorizedModules.filter(
          (m) => m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q),
        )
      : authorizedModules;
    // Favoritos primeiro, mantendo a ordem original dentro de cada grupo.
    return [...list].sort(
      (a, b) => Number(favorites.includes(b.slug)) - Number(favorites.includes(a.slug)),
    );
  }, [authorizedModules, favorites, query]);

  const pending = counts?.grants_pending_review ?? 0;
  const suspended = counts?.users_suspended ?? 0;
  const attentionCount = (pending > 0 ? 1 : 0) + (suspended > 0 ? 1 : 0);
  const orgName = data?.organization.name ?? ctx?.organization.name;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl bg-ink px-5 py-6 text-white shadow-pop sm:px-8 sm:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#5392ef] opacity-30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-40 h-64 w-64 rounded-full bg-accent opacity-20 blur-3xl"
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium capitalize text-white/60">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[32px] sm:leading-tight">
              {greeting()}, {firstName(ctx?.user.name) || "bem-vindo"}
            </h1>
            <p className="mt-2 inline-flex max-w-full items-center gap-1.5 text-sm text-white/70">
              <Building2 size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{orgName}</span>
            </p>
          </div>

          {isManager && counts && (
            <Link
              href={pending > 0 ? "/acessos" : suspended > 0 ? "/usuarios" : "/auditoria"}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 backdrop-blur transition ${
                attentionCount
                  ? "bg-warning-soft/15 text-warning-soft ring-warning-soft/30 hover:bg-warning-soft/25"
                  : "bg-accent-soft/10 text-accent-soft ring-accent-soft/25 hover:bg-accent-soft/20"
              }`}
            >
              {attentionCount ? (
                <>
                  <CircleAlert size={14} aria-hidden="true" />
                  {plural(attentionCount, "item pede atenção", "itens pedem atenção")}
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} aria-hidden="true" /> Tudo em dia
                </>
              )}
            </Link>
          )}
        </div>

        <nav aria-label="Atalhos" className="relative mt-6 flex flex-wrap gap-2">
          {isManager ? (
            <>
              <HeroAction href="/usuarios" icon={UserPlus} label="Novo usuário" primary />
              <HeroAction href="/acessos" icon={KeyRound} label="Gerenciar acessos" />
              <HeroAction href="/modulos-contratados" icon={Blocks} label="Módulos" />
              <HeroAction href="/auditoria" icon={ScrollText} label="Auditoria" />
            </>
          ) : (
            <>
              <HeroAction href="/modulos-contratados" icon={Blocks} label="Meus módulos" primary />
              <HeroAction href="/novidades" icon={Sparkles} label="Novidades" />
              <HeroAction href="/perfil" icon={UserCog} label="Meu perfil" />
              <HeroAction href="/ajuda" icon={ScrollText} label="Ajuda" />
            </>
          )}
        </nav>
      </header>

      {isManager && error && !data && (
        <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
      )}

      {/* Indicadores */}
      {isManager && !(error && !data) && (
        <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat
            label="Usuários ativos"
            icon={Users}
            href="/usuarios"
            value={counts?.users_active}
            meter={counts ? { value: counts.users_active, total: counts.users_total } : undefined}
            foot={
              counts &&
              (suspended > 0 ? (
                <span className="text-warning-ink">{plural(suspended, "suspenso", "suspensos")}</span>
              ) : (
                <>de {counts.users_total} cadastrados</>
              ))
            }
          />
          <Stat
            label="Gestores"
            icon={ShieldCheck}
            href="/usuarios"
            value={counts?.managers_active}
            foot={counts && (counts.managers_active > 0 ? "com perfil de gestor" : <span className="text-warning-ink">nenhum gestor ativo</span>)}
          />
          <Stat
            label="Módulos contratados"
            icon={Blocks}
            href="/modulos-contratados"
            value={counts?.modules_contracted}
            foot={counts && `${authorizedModules.length} liberados para você`}
          />
          <Stat
            label="Acessos concedidos"
            icon={KeyRound}
            href="/acessos"
            value={counts?.grants_total}
            tone={pending > 0 ? "warn" : "default"}
            foot={
              counts &&
              (pending > 0 ? (
                <span className="font-semibold text-warning-ink">{pending} aguardando revisão</span>
              ) : (
                <span className="text-accent-ink">nenhum pendente</span>
              ))
            }
          />
        </section>
      )}

      {/* Pendências */}
      {isManager && attentionCount > 0 && (
        <section aria-label="Pendências" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {pending > 0 && (
            <AttentionItem
              icon={KeyRound}
              title={`${plural(pending, "acesso aguarda", "acessos aguardam")} revisão`}
              description="Permissões de módulos que precisam da sua validação."
              href="/acessos"
              cta="Revisar"
            />
          )}
          {suspended > 0 && (
            <AttentionItem
              icon={UserCog}
              title={`${plural(suspended, "usuário suspenso", "usuários suspensos")}`}
              description="Reative contas ou ajuste vínculos conforme a política."
              href="/usuarios"
              cta="Ver usuários"
            />
          )}
        </section>
      )}

      {/* Meus módulos */}
      <section aria-labelledby="modulos-titulo">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="modulos-titulo" className="text-lg font-bold tracking-tight text-ink">
              Meus módulos
            </h2>
            <p className="text-xs text-muted">Toque na estrela para fixar um módulo no início da lista.</p>
          </div>
          {authorizedModules.length > 6 && (
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Buscar módulo</span>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar módulo"
                className="w-full rounded-full border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10"
              />
            </label>
          )}
        </div>

        {authorizedModules.length === 0 ? (
          <EmptyState
            icon={<Blocks size={20} />}
            title="Nenhum módulo liberado"
            description="Fale com o gestor do órgão para vincular seus acessos."
          />
        ) : shownModules.length === 0 ? (
          <EmptyState title="Nenhum módulo encontrado" description={`Nada corresponde a “${query}”.`} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shownModules.map((m) => (
              <ModuleTile
                key={m.slug}
                module={m}
                favorite={favorites.includes(m.slug)}
                onToggleFavorite={() => toggleFavorite(m.slug)}
                onOpen={() => openModule(m)}
                opening={opening === m.slug}
                disabled={opening !== null && opening !== m.slug}
              />
            ))}
          </div>
        )}
        {error && data && (
          <p className="mt-3 rounded-xl border border-danger-soft bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>
        )}
      </section>

      {/* Atividade + coluna lateral (gestor) */}
      {isManager && data && (
        <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <ActivityFeed events={data.recent_activity} />

          <div className="space-y-4">
            <HealthCard
              orgName={data.organization.name}
              orgSlug={data.organization.slug}
              checks={[
                {
                  label: "Equipe ativa",
                  ok: data.counts.users_active > 0,
                  detail: plural(data.counts.users_active, "ativo", "ativos"),
                },
                {
                  label: "Gestor disponível",
                  ok: data.counts.managers_active > 0,
                  detail: plural(data.counts.managers_active, "gestor", "gestores"),
                },
                {
                  label: "Acessos revisados",
                  ok: pending === 0,
                  detail: pending ? `${pending} aguardando` : "em dia",
                },
                {
                  label: "Sem contas suspensas",
                  ok: suspended === 0,
                  detail: suspended ? plural(suspended, "suspensa", "suspensas") : "nenhuma",
                },
              ]}
            />

            {data.news.length > 0 && (
              <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Sparkles size={15} aria-hidden="true" /> Novidades
                  </h3>
                  <Link href="/novidades" className="text-xs font-semibold text-ink hover:underline">
                    Ver todas
                  </Link>
                </div>
                <ul className="-mx-2 space-y-1">
                  {data.news.map((n) => {
                    const v = moduleVisual(n.slug);
                    const Icon = v.icon as LucideIcon;
                    return (
                      <li key={n.slug}>
                        <Link
                          href={`/novidades/${n.slug}`}
                          className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-paper"
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${v.gradient}`}
                          >
                            <Icon size={16} className="text-white" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{n.name}</span>
                            <span className="block text-xs text-muted">
                              Contratado em {formatDate(n.created_at)}
                            </span>
                          </span>
                          <ArrowRight
                            size={15}
                            className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function HeroAction({
  href,
  icon: Icon,
  label,
  primary = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        primary
          ? "bg-white text-ink hover:bg-white/90"
          : "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
      }`}
    >
      <Icon size={15} aria-hidden="true" />
      {label}
    </Link>
  );
}

function Stat({
  label,
  icon: Icon,
  value,
  href,
  foot,
  meter,
  tone = "default",
}: {
  label: string;
  icon: LucideIcon;
  value?: number;
  href: string;
  foot?: React.ReactNode;
  meter?: { value: number; total: number };
  tone?: "default" | "warn";
}) {
  const loading = value === undefined;
  const pct = meter && meter.total > 0 ? Math.round((meter.value / meter.total) * 100) : null;
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-2xl border border-line bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-pop focus:outline-none focus-visible:ring-2 focus-visible:ring-ink sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            tone === "warn" ? "bg-warning-soft text-warning-ink" : "bg-paper text-ink"
          }`}
        >
          <Icon size={15} aria-hidden="true" />
        </span>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-16 animate-pulse rounded-lg bg-paper" />
      ) : (
        <p className="mt-2 text-3xl font-bold tabular-nums leading-none tracking-tight text-ink">{value}</p>
      )}
      {pct !== null && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper"
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% ativos`}
        >
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 min-h-[1rem] text-xs text-muted">{loading ? "" : foot}</p>
      <ArrowUpRight
        size={14}
        className="absolute bottom-4 right-4 text-muted opacity-0 transition group-hover:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}

function AttentionItem({
  icon: Icon,
  title,
  description,
  href,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-warning-soft bg-gradient-to-r from-warning-soft/70 to-white p-4 shadow-card transition hover:shadow-pop"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-warning-ink ring-1 ring-warning-soft">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-warning-ink sm:inline-flex">
        {cta} <ArrowRight size={13} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function HealthCard({
  orgName,
  orgSlug,
  checks,
}: {
  orgName: string;
  orgSlug: string;
  checks: { label: string; ok: boolean; detail: string }[];
}) {
  const ok = checks.filter((c) => c.ok).length;
  const pct = checks.length ? ok / checks.length : 1;
  const R = 22;
  const C = 2 * Math.PI * R;
  const all = ok === checks.length;
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 shrink-0" aria-hidden="true">
          <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
            <circle cx="28" cy="28" r={R} fill="none" strokeWidth="6" className="stroke-paper" />
            <circle
              cx="28"
              cy="28"
              r={R}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              className={all ? "stroke-accent" : "stroke-warning"}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-ink">
            {ok}/{checks.length}
          </span>
        </div>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <HeartPulse size={15} aria-hidden="true" /> Saúde do órgão
          </h3>
          <p className="truncate text-xs text-muted" title={orgName}>
            {orgName} · @{orgSlug}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-ink">
              {c.ok ? (
                <CheckCircle2 size={16} className="text-accent" aria-label="OK" />
              ) : (
                <AlertTriangle size={16} className="text-warning" aria-label="Atenção" />
              )}
              {c.label}
            </span>
            <span className={`text-xs ${c.ok ? "text-muted" : "font-semibold text-warning-ink"}`}>{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModuleTile({
  module: m,
  favorite,
  onToggleFavorite,
  onOpen,
  opening,
  disabled,
}: {
  module: ModuleCardData;
  favorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  opening: boolean;
  disabled: boolean;
}) {
  const visual = moduleVisual(m.slug);
  const Icon = visual.icon as LucideIcon;
  const blocked = !m.is_active;
  const hasNews = m.slug in MODULE_NEWS;
  return (
    <div
      className={`group relative flex min-w-0 items-center gap-4 rounded-2xl border bg-white p-4 shadow-card transition ${
        blocked
          ? "border-line opacity-60"
          : "border-line hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-pop"
      } ${favorite ? "ring-1 ring-warning/30" : ""}`}
    >
      <span
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br shadow-sm ${visual.gradient}`}
      >
        <Icon size={20} className="text-white" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pr-7">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* O botão cobre o card inteiro; a estrela fica por cima dele. */}
          <button
            type="button"
            onClick={onOpen}
            disabled={blocked || disabled}
            className="truncate text-left text-sm font-semibold text-ink after:absolute after:inset-0 after:rounded-2xl focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ink disabled:cursor-not-allowed"
          >
            {m.name}
          </button>
          {m.requires_review && (
            <span className="shrink-0 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-ink">
              em revisão
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">
          {blocked ? "Módulo indisponível no momento" : m.description || "Módulo do sistema de gestão."}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
            {opening ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Abrindo…
              </>
            ) : blocked ? (
              <>
                <Lock size={12} aria-hidden="true" /> Indisponível
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted transition group-hover:text-ink">
                Abrir <ArrowRight size={12} className="transition group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            )}
          </p>
          {hasNews ? (
            <Link
              href={`/novidades/${m.slug}`}
              title={`Ver as novidades da versão ${m.version}`}
              className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink transition hover:bg-accent-soft/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <Sparkles size={10} aria-hidden="true" /> v{m.version} · Novidades
            </Link>
          ) : (
            <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">
              v{m.version}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? `Remover ${m.name} dos favoritos` : `Fixar ${m.name} nos favoritos`}
        className={`absolute right-3 top-3 z-10 rounded-full p-1.5 transition hover:bg-paper ${
          favorite ? "text-warning" : "text-muted/40 hover:text-warning group-hover:text-muted"
        }`}
      >
        <Star size={16} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
      </button>
    </div>
  );
}
