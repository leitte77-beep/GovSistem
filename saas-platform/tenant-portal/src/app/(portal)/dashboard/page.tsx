"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Blocks,
  ShieldCheck,
  Activity,
  UserPlus,
  ScrollText,
  AlertTriangle,
  Settings2,
  Star,
  Building2,
  Clock,
  Sparkles,
  Filter,
  TrendingUp,
  CheckCircle2,
  KeyRound,
  UserCog,
  LogIn,
  ArrowUpRight,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import type { ModuleCard as ModuleCardData } from "@/lib/auth-provider";
import ModuleCard from "@/components/module-card";
import KpiCard from "@/components/kpi-card";
import FilterChip from "@/components/filter-chip";
import EmptyState from "@/components/empty-state";
import NewsCard from "@/components/news-card";
import { actionLabel, formatRelative } from "@/lib/format";

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
  recent_activity: Array<{
    id: string;
    action: string;
    actor_email?: string | null;
    created_at?: string | null;
    details?: Record<string, unknown> | null;
  }>;
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

const ACTIVITY_FILTERS = [
  { key: "all", label: "Tudo", match: () => true },
  { key: "access", label: "Acessos", match: (a: string) => a.startsWith("module_") || a === "login" || a === "logout" },
  { key: "users", label: "Usuários", match: (a: string) => a.includes("user_") || a.includes("membership_") },
  { key: "grants", label: "Permissões", match: (a: string) => a.startsWith("grant_") },
  { key: "security", label: "Segurança", match: (a: string) => a.includes("password") || a.includes("session") || a === "force_password_reset" },
] as const;

const ACTION_ICON: Record<string, { icon: typeof LogIn; tone: string }> = {
  login: { icon: LogIn, tone: "bg-paper text-ink ring-line" },
  logout: { icon: LogIn, tone: "bg-paper text-muted ring-line" },
  module_access: { icon: Blocks, tone: "bg-paper text-ink ring-line" },
  module_access_failed: { icon: AlertTriangle, tone: "bg-danger-soft text-danger-ink ring-danger-soft" },
  user_create: { icon: UserPlus, tone: "bg-accent-soft text-accent-ink ring-accent-soft" },
  membership_suspended: { icon: UserCog, tone: "bg-warning-soft text-warning-ink ring-warning-soft" },
  membership_activated: { icon: CheckCircle2, tone: "bg-accent-soft text-accent-ink ring-accent-soft" },
  grant_created: { icon: KeyRound, tone: "bg-paper text-ink ring-line" },
  grant_removed: { icon: KeyRound, tone: "bg-danger-soft text-danger-ink ring-danger-soft" },
  password_changed: { icon: KeyRound, tone: "bg-paper text-ink ring-line" },
};

function actionVisual(action: string) {
  return (
    ACTION_ICON[action] ?? {
      icon: Settings2,
      tone: "bg-paper text-muted ring-line",
    }
  );
}

export default function DashboardPage() {
  const { ctx } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activityFilter, setActivityFilter] = useState<string>("all");

  useEffect(() => {
    const stored = localStorage.getItem("gov_favorite_modules");
    if (stored) setFavorites(JSON.parse(stored));
  }, []);

  const toggleFavorite = (slug: string) => {
    setFavorites((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      localStorage.setItem("gov_favorite_modules", JSON.stringify(next));
      return next;
    });
  };

  const openModule = async (m: ModuleCardData) => {
    setError("");
    setOpening(m.slug);
    try {
      const res = await api<{ module_token: string; module_url: string }>("/auth/module-access", {
        method: "POST",
        body: { module_slug: m.slug },
      });
      const joiner = res.module_url.includes("?") ? "&" : "?";
      window.location.href = `${res.module_url}${joiner}token=${encodeURIComponent(res.module_token)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar o módulo");
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

  const isManager = ctx?.user.is_manager;
  const counts = data?.counts;
  const modules = ctx?.modules ?? [];
  const authorizedModules = modules.filter((m) => m.authorized);
  const favModules = authorizedModules.filter((m) => favorites.includes(m.slug));
  const otherModules = authorizedModules.filter((m) => !favorites.includes(m.slug));

  const filteredActivity = useMemo(() => {
    if (!data) return [];
    const filter = ACTIVITY_FILTERS.find((f) => f.key === activityFilter) ?? ACTIVITY_FILTERS[0];
    return data.recent_activity.filter((a) => filter.match(a.action));
  }, [data, activityFilter]);

  const activityCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const result: Record<string, number> = {};
    ACTIVITY_FILTERS.forEach((f) => {
      if (f.key === "all") {
        result[f.key] = data.recent_activity.length;
      } else {
        result[f.key] = data.recent_activity.filter((a) => f.match(a.action)).length;
      }
    });
    return result;
  }, [data]);

  const hasPendingReview = (counts?.grants_pending_review ?? 0) > 0;
  const hasSuspended = (counts?.users_suspended ?? 0) > 0;
  const hasAttention = hasPendingReview || hasSuspended;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Masthead editorial */}
      <header className="border-b border-line pb-4 sm:pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Visão geral</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4 sm:gap-6">
          <div>
            <h1 className="text-display text-ink">
              {greeting()}, {firstName(ctx?.user.name) || "bem-vindo"}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5 capitalize">
                <Clock size={14} aria-hidden="true" />
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={14} aria-hidden="true" />
                {data?.organization.name ?? ctx?.organization.name}
              </span>
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              {isManager
                ? `Resumo de ${data?.organization.name ?? "seu órgão"} hoje.`
                : "Seus módulos, atalhos e novidades em um só lugar."}
            </p>
          </div>
          {isManager && counts && (
            <dl className="grid w-full grid-cols-3 divide-x divide-line overflow-hidden rounded-xl border border-line bg-white text-center shadow-card sm:w-auto sm:text-left">
              {[
                { label: "Usuários ativos", value: counts.users_active },
                { label: "Módulos", value: counts.modules_contracted },
                { label: "Grants", value: counts.grants_total },
              ].map((s) => (
                <div key={s.label} className="px-3 py-3 sm:px-5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{s.label}</dt>
                  <dd className="mt-1 text-2xl font-bold leading-none text-ink">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </header>

      {/* Atalhos rápidos (gestor e usuário) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {isManager ? (
          <>
            <QuickAction href="/usuarios" icon={UserPlus} label="Novo usuário" tone="primary" />
            <QuickAction href="/acessos" icon={KeyRound} label="Gerenciar acessos" />
            <QuickAction href="/modulos-contratados" icon={Blocks} label="Ver módulos" />
            <QuickAction href="/auditoria" icon={ScrollText} label="Auditoria" />
          </>
        ) : (
          <>
            <QuickAction href="/modulos-contratados" icon={Blocks} label="Meus módulos" tone="primary" />
            <QuickAction href="/novidades" icon={Sparkles} label="Novidades" />
            <QuickAction href="/perfil" icon={UserCog} label="Meu perfil" />
            <QuickAction href="/ajuda" icon={ScrollText} label="Ajuda" />
          </>
        )}
      </div>

      {isManager &&
        (error ? (
          <p className="rounded-xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
        ) : (
          <>
            {/* KPIs */}
            <section>
              <SectionHeader title="Indicadores" subtitle="Visão geral do órgão em tempo real" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <KpiCard
                  label="Usuários ativos"
                  value={counts?.users_active ?? "—"}
                  icon={Users}
                  href="/usuarios"
                  tone="blue"
                  loading={!data}
                />
                <KpiCard
                  label="Usuários suspensos"
                  value={counts?.users_suspended ?? "—"}
                  icon={AlertTriangle}
                  href="/usuarios"
                  tone="red"
                  hint={hasSuspended ? "Requer atenção" : undefined}
                  loading={!data}
                />
                <KpiCard
                  label="Gestores ativos"
                  value={counts?.managers_active ?? "—"}
                  icon={ShieldCheck}
                  href="/usuarios"
                  tone="violet"
                  loading={!data}
                />
                <KpiCard
                  label="Módulos contratados"
                  value={counts?.modules_contracted ?? "—"}
                  icon={Blocks}
                  href="/modulos-contratados"
                  tone="cyan"
                  loading={!data}
                />
                <KpiCard
                  label="Grants concedidos"
                  value={counts?.grants_total ?? "—"}
                  icon={Activity}
                  href="/acessos"
                  tone="emerald"
                  loading={!data}
                />
                <KpiCard
                  label="Pendências de revisão"
                  value={counts?.grants_pending_review ?? "—"}
                  icon={Settings2}
                  href="/acessos"
                  tone="amber"
                  hint={hasPendingReview ? "Clique para revisar" : undefined}
                  loading={!data}
                />
              </div>
            </section>

            {/* Pendências / Atenção */}
            {hasAttention && (
              <section className="rounded-xl border border-warning-soft bg-warning-soft/50 p-5 shadow-card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-soft text-warning-ink">
                    <AlertTriangle size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-ink">Itens que precisam da sua atenção</h2>
                    <p className="text-xs text-muted">
                      Resolva as pendências para manter o órgão em ordem.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {hasPendingReview && (
                    <AttentionItem
                      icon={Settings2}
                      title={`${counts?.grants_pending_review} grants aguardando revisão`}
                      description="Permissões de módulos que precisam da sua validação."
                      href="/acessos"
                      cta="Revisar agora"
                    />
                  )}
                  {hasSuspended && (
                    <AttentionItem
                      icon={UserCog}
                      title={`${counts?.users_suspended} usuário(s) suspenso(s)`}
                      description="Reative contas ou ajuste vínculos conforme a política."
                      href="/usuarios"
                      cta="Ver usuários"
                    />
                  )}
                </div>
              </section>
            )}
          </>
        ))}

      {/* Meus módulos */}
      <section>
        <SectionHeader
          title="Meus módulos"
          subtitle="Use a estrela para fixar seus módulos favoritos no topo."
          icon={Blocks}
        />
        <div className="rounded-xl border border-line bg-white p-5 shadow-card sm:p-6">
          {modules.length === 0 ? (
            <EmptyState
              icon={<Blocks size={20} />}
              title="Nenhum módulo liberado"
              description="Fale com o gestor do órgão para vincular seus acessos."
            />
          ) : (
            <div className="space-y-6">
              {favModules.length > 0 && (
                <div>
                  <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning-ink">
                    <Star size={12} fill="currentColor" aria-hidden="true" /> Favoritos
                  </p>
                  <div className="grid grid-cols-1 gap-2 [&>*]:min-w-0 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
                    {favModules.map((m) => (
                      <ModuleTile
                        key={m.slug}
                        module={m}
                        favorite
                        onToggleFavorite={() => toggleFavorite(m.slug)}
                        onOpen={() => openModule(m)}
                        opening={opening === m.slug}
                      />
                    ))}
                  </div>
                </div>
              )}
              {otherModules.length > 0 && (
                <div>
                  {favModules.length > 0 && (
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Outros módulos
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2 [&>*]:min-w-0 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
                    {otherModules.map((m) => (
                      <ModuleTile
                        key={m.slug}
                        module={m}
                        onToggleFavorite={() => toggleFavorite(m.slug)}
                        onOpen={() => openModule(m)}
                        opening={opening === m.slug}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {error && (
            <p className="mt-3 rounded-lg border border-danger-soft bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>
          )}
        </div>
      </section>

      {/* Novidades (todos os perfis) */}
      {data && data.news.length > 0 && (
        <section>
          <SectionHeader
            title="Novidades"
            subtitle="Módulos contratados recentemente para o seu órgão"
            action={
              <Link
                href="/novidades"
                className="inline-flex items-center gap-1 text-sm font-semibold text-ink hover:underline"
              >
                Ver todas <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.news.map((n) => (
              <NewsCard
                key={n.slug}
                slug={n.slug}
                name={n.name}
                description={n.description}
                version={n.version}
                createdAt={n.created_at}
              />
            ))}
          </div>
        </section>
      )}

      {/* Atividade + visão rápida (gestor) */}
      {isManager && data && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-white shadow-card lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-ink">
                  <TrendingUp size={16} className="text-ink" aria-hidden="true" /> Atividade recente
                </h2>
                <p className="text-xs text-muted">
                  Últimos eventos registrados no órgão
                </p>
              </div>
              <Link
                href="/auditoria"
                className="inline-flex items-center gap-1 text-sm font-semibold text-ink hover:underline"
              >
                Auditoria completa <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-paper px-5 py-3">
              <Filter size={13} className="mr-1 text-muted" aria-hidden="true" />
              {ACTIVITY_FILTERS.map((f) => (
                <FilterChip
                  key={f.key}
                  label={f.label}
                  active={activityFilter === f.key}
                  onClick={() => setActivityFilter(f.key)}
                  count={activityCounts[f.key] ?? 0}
                />
              ))}
            </div>
            <div className="p-2">
              {filteredActivity.length ? (
                <ul className="divide-y divide-line">
                  {filteredActivity.map((a) => {
                    const visual = actionVisual(a.action);
                    const Icon = visual.icon;
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-paper"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${visual.tone}`}
                          >
                            <Icon size={16} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">
                              {actionLabel(a.action)}
                            </p>
                            {a.actor_email && (
                              <p className="truncate text-xs text-muted">
                                por {a.actor_email}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-muted">
                          {formatRelative(a.created_at)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-4">
                  <EmptyState
                    title="Nenhuma atividade neste filtro"
                    description="Tente outro filtro ou limpe para ver todos os eventos."
                    action={
                      <button
                        onClick={() => setActivityFilter("all")}
                        className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-paper"
                      >
                        Mostrar tudo
                      </button>
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-white p-5 shadow-card">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white">
                  <Building2 size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">
                    {data.organization.name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    @{data.organization.slug}
                  </p>
                </div>
              </div>
              <div className="space-y-2.5 text-sm">
                <SummaryRow icon={ShieldCheck} label="Gestores ativos" value={counts?.managers_active} />
                <SummaryRow
                  icon={Settings2}
                  label="Pendências"
                  value={counts?.grants_pending_review}
                  tone="amber"
                />
                <SummaryRow icon={Blocks} label="Módulos" value={counts?.modules_contracted} />
                <SummaryRow icon={Activity} label="Grants" value={counts?.grants_total} />
              </div>
            </div>

            <div className="rounded-xl border border-line bg-white p-5 shadow-card">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <ListChecks size={15} className="text-ink" aria-hidden="true" /> Saúde do órgão
              </h3>
              <ul className="space-y-2.5 text-sm">
                <HealthRow
                  icon={Users}
                  label="Equipe ativa"
                  ok={(counts?.users_active ?? 0) > 0}
                  detail={`${counts?.users_active ?? 0} ativos`}
                />
                <HealthRow
                  icon={ShieldCheck}
                  label="Gestor disponível"
                  ok={(counts?.managers_active ?? 0) > 0}
                  detail={`${counts?.managers_active ?? 0} gestores`}
                />
                <HealthRow
                  icon={ListChecks}
                  label="Sem pendências"
                  ok={!hasPendingReview}
                  detail={
                    hasPendingReview
                      ? `${counts?.grants_pending_review} aguardando`
                      : "Tudo em dia"
                  }
                />
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: typeof Blocks;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-ink">
          {Icon && <Icon size={16} className="text-ink" aria-hidden="true" />}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  tone,
}: {
  href: string;
  icon: typeof UserPlus;
  label: string;
  tone?: "primary";
}) {
  const primary = tone === "primary";
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border px-3 py-3 shadow-card transition ${
        primary
          ? "border-ink bg-ink text-white hover:bg-ink-soft"
          : "border-line bg-white text-ink hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-md"
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
          primary
            ? "bg-white/10 text-white"
            : "bg-paper text-ink group-hover:bg-ink/5"
        }`}
      >
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <ArrowUpRight
        size={15}
        className={`transition group-hover:translate-x-0.5 ${
          primary ? "text-white/80" : "text-muted"
        }`}
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
  icon: typeof AlertTriangle;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-warning-soft bg-white p-3 shadow-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-warning-soft text-warning-ink">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </div>
      <Link
        href={href}
        className="shrink-0 rounded-md border border-warning-soft bg-warning-soft px-2.5 py-1.5 text-xs font-semibold text-warning-ink transition hover:bg-warning-soft/70"
      >
        {cta}
      </Link>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof ShieldCheck;
  label: string;
  value?: number | string;
  tone?: "default" | "amber";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-muted">
        <Icon size={14} className="opacity-70" aria-hidden="true" /> {label}
      </span>
      <span
        className={`font-semibold ${tone === "amber" && Number(value) > 0 ? "text-warning-ink" : "text-ink"}`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function HealthRow({
  icon: Icon,
  label,
  ok,
  detail,
}: {
  icon: typeof Users;
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-ink">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${
            ok
              ? "bg-accent-soft text-accent-ink"
              : "bg-warning-soft text-warning-ink"
          }`}
        >
          <Icon size={14} aria-hidden="true" />
        </span>
        <span className="text-sm">{label}</span>
      </span>
      <span
        className={`text-xs font-medium ${ok ? "text-accent-ink" : "text-warning-ink"}`}
      >
        {detail}
      </span>
    </li>
  );
}

function ModuleTile({
  module: m,
  favorite = false,
  onToggleFavorite,
  onOpen,
  opening,
}: {
  module: ModuleCardData;
  favorite?: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  opening: boolean;
}) {
  return (
    <div className="relative min-w-0">
      <button
        onClick={onToggleFavorite}
        aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-warning transition hover:bg-white sm:right-3 sm:top-3 sm:bg-white/85 sm:shadow-card"
      >
        <Star size={16} fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
      </button>
      <ModuleCard
        slug={m.slug}
        name={m.name}
        description={m.description}
        version={m.version}
        is_active={m.is_active}
        authorized={m.authorized}
        requires_review={m.requires_review}
        opening={opening}
        onOpen={onOpen}
      />
    </div>
  );
}
