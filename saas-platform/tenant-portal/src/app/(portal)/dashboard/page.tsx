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
  Eye,
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
  login: { icon: LogIn, tone: "bg-blue-50 text-blue-600 ring-blue-100" },
  logout: { icon: LogIn, tone: "bg-gray-100 text-gray-500 ring-gray-200" },
  module_access: { icon: Blocks, tone: "bg-cyan-50 text-cyan-600 ring-cyan-100" },
  module_access_failed: { icon: AlertTriangle, tone: "bg-red-50 text-red-600 ring-red-100" },
  user_create: { icon: UserPlus, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  membership_suspended: { icon: UserCog, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
  membership_activated: { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  grant_created: { icon: KeyRound, tone: "bg-violet-50 text-violet-600 ring-violet-100" },
  grant_removed: { icon: KeyRound, tone: "bg-red-50 text-red-600 ring-red-100" },
  password_changed: { icon: KeyRound, tone: "bg-violet-50 text-violet-600 ring-violet-100" },
};

function actionVisual(action: string) {
  return (
    ACTION_ICON[action] ?? {
      icon: Settings2,
      tone: "bg-surface-container text-on-surface-variant ring-outline-variant",
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
    <div className="space-y-6">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white shadow-lg sm:p-8"
        style={{ background: "linear-gradient(135deg, #002b54 0%, #1e3a8a 55%, #2563eb 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.35) 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 70%)" }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-white/75">
              <Clock size={13} />
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              <span className="mx-1.5 h-1 w-1 rounded-full bg-white/40" />
              <Building2 size={13} />
              {data?.organization.name ?? ctx?.organization.name}
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting()},{" "}
              <span className="bg-gradient-to-r from-cyan-200 to-cyan-400 bg-clip-text text-transparent">
                {firstName(ctx?.user.name) || "bem-vindo"}
              </span>{" "}
              <span className="inline-block animate-[wave_1.8s_ease-in-out_infinite] origin-[70%_70%]">👋</span>
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-white/80">
              {isManager
                ? `Aqui está um resumo de ${data?.organization.name ?? "seu órgão"} hoje.`
                : "Seus módulos, atalhos e novidades em um só lugar."}
            </p>
          </div>
          {isManager && counts && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: "Usuários ativos", value: counts.users_active, icon: Users, accent: "from-cyan-400/30 to-cyan-400/0" },
                { label: "Módulos", value: counts.modules_contracted, icon: Blocks, accent: "from-emerald-400/30 to-emerald-400/0" },
                { label: "Grants", value: counts.grants_total, icon: Activity, accent: "from-violet-400/30 to-violet-400/0" },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.label}
                    className="relative overflow-hidden rounded-xl bg-white/10 px-4 py-3 backdrop-blur-md ring-1 ring-white/15"
                  >
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.accent}`} />
                    <div className="relative flex items-center gap-2 text-white/75">
                      <Icon size={14} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</span>
                    </div>
                    <p className="relative mt-1 text-2xl font-bold leading-none">{s.value}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>
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
              <section className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-on-surface">Itens que precisam da sua atenção</h2>
                    <p className="text-xs text-on-surface-variant">
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
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm sm:p-6">
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
                  <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-600">
                    <Star size={12} fill="currentColor" /> Favoritos
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      Outros módulos
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>
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
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
              >
                Ver todas <ArrowUpRight size={14} />
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
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-on-surface">
                  <TrendingUp size={16} className="text-primary-700" /> Atividade recente
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Últimos eventos registrados no órgão
                </p>
              </div>
              <Link
                href="/auditoria"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
              >
                Auditoria completa <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5 border-b border-outline-variant bg-surface-container-low/50 px-5 py-3">
              <Filter size={13} className="mr-1 self-center text-on-surface-variant" />
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
                <ul className="divide-y divide-outline-variant">
                  {filteredActivity.map((a) => {
                    const visual = actionVisual(a.action);
                    const Icon = visual.icon;
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-surface-container-low/60"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${visual.tone}`}
                          >
                            <Icon size={16} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-on-surface">
                              {actionLabel(a.action)}
                            </p>
                            {a.actor_email && (
                              <p className="truncate text-xs text-on-surface-variant">
                                por {a.actor_email}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-on-surface-variant">
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
                        className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50"
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
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-700 to-primary-500 text-white shadow-sm">
                  <Building2 size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-on-surface">
                    {data.organization.name}
                  </p>
                  <p className="truncate text-xs text-on-surface-variant">
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

            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
                <ListChecks size={15} className="text-primary-700" /> Saúde do órgão
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
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-on-surface">
          {Icon && <Icon size={16} className="text-primary-700" />}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
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
      className={`group flex items-center gap-3 rounded-xl border px-3 py-3 shadow-sm transition ${
        primary
          ? "border-primary-600 bg-primary-600 text-white hover:bg-primary-700"
          : "border-outline-variant bg-surface-container-lowest text-on-surface hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 transition ${
          primary
            ? "bg-white/15 text-white ring-white/20"
            : "bg-primary-50 text-primary-700 ring-primary-100 group-hover:bg-primary-100"
        }`}
      >
        <Icon size={17} />
      </div>
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <ArrowUpRight
        size={15}
        className={`opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100 ${
          primary ? "text-white" : "text-on-surface-variant"
        }`}
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
    <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">{title}</p>
          <p className="text-xs text-on-surface-variant">{description}</p>
        </div>
      </div>
      <Link
        href={href}
        className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
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
      <span className="inline-flex items-center gap-2 text-on-surface-variant">
        <Icon size={14} className="opacity-70" /> {label}
      </span>
      <span
        className={`font-semibold ${tone === "amber" && Number(value) > 0 ? "text-amber-600" : "text-on-surface"}`}
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
      <span className="inline-flex items-center gap-2 text-on-surface">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 ${
            ok
              ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
              : "bg-amber-50 text-amber-600 ring-amber-100"
          }`}
        >
          <Icon size={14} />
        </span>
        <span className="text-sm">{label}</span>
      </span>
      <span
        className={`text-xs font-medium ${ok ? "text-emerald-700" : "text-amber-700"}`}
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
    <div className="relative">
      <button
        onClick={onToggleFavorite}
        aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        className="absolute right-3 top-3 z-10 rounded-lg bg-white/80 p-1.5 text-amber-500 shadow-sm transition hover:bg-white"
      >
        <Star size={16} fill={favorite ? "currentColor" : "none"} />
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
