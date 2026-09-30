"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Blocks,
  Clock,
  ExternalLink,
  KeyRound,
  Loader2,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { moduleVisual } from "@/components/module-card";
import EmptyState from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { MODULE_NEWS } from "@/lib/novidades";
import { openModuleInNewTab } from "@/lib/open-module";
import { formatDateTime, formatRelative } from "@/lib/format";

interface ContractedModule {
  slug: string;
  name: string;
  description?: string | null;
  version: string;
  is_active: boolean;
  status: string;
  users_with_grant: number;
  roles_in_use: string[];
  roles_count?: Record<string, number>;
  pending_review: number;
  accesses_30d?: number;
  active_users_30d?: number;
  last_access_at?: string | null;
}

interface CatalogModule {
  slug: string;
  roles: { name: string; label: string }[];
}

function roleTitle(label: string) {
  return label.split(/\s+[—–-]\s+/)[0];
}

export default function ContractedModulesPage() {
  const { ctx } = useAuth();
  const { toast } = useToast();
  const [modules, setModules] = useState<ContractedModule[]>([]);
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<ContractedModule[]>("/tenant/contracted-modules"),
      api<CatalogModule[]>("/tenant/roles").catch(() => []),
    ])
      .then(([m, c]) => {
        setModules(m);
        setCatalog(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar módulos"))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(
    () => ({
      accesses: modules.reduce((n, m) => n + (m.accesses_30d ?? 0), 0),
      pending: modules.reduce((n, m) => n + m.pending_review, 0),
      unused: modules.filter((m) => m.is_active && (m.accesses_30d ?? 0) === 0).length,
    }),
    [modules],
  );

  const roleLabel = (slug: string, role: string) => {
    const r = catalog.find((c) => c.slug === slug)?.roles.find((x) => x.name === role);
    return r ? roleTitle(r.label) : role;
  };
  const canOpen = (slug: string) => !!ctx?.modules.find((m) => m.slug === slug && m.authorized && m.is_active);

  const open = async (m: ContractedModule) => {
    setOpening(m.slug);
    try {
      await openModuleInNewTab(m.slug, m.name);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao abrir o módulo");
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-ink">Módulos contratados</h1>
          <p className="mt-1 text-sm text-muted">O que o órgão contratou, quem usa e como está o uso.</p>
        </div>
        {!loading && modules.length > 0 && (
          <dl className="flex divide-x divide-line overflow-hidden rounded-2xl border border-line bg-white text-center shadow-card">
            <Stat label="Módulos" value={modules.length} />
            <Stat label="Usos em 30 dias" value={totals.accesses} />
            {totals.pending > 0 && <Stat label="Pendências" value={totals.pending} warn />}
          </dl>
        )}
      </header>

      {!loading && totals.unused > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted shadow-card">
          <Activity size={16} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
          {totals.unused === 1
            ? "1 módulo contratado não foi aberto por ninguém nos últimos 30 dias."
            : `${totals.unused} módulos contratados não foram abertos por ninguém nos últimos 30 dias.`}{" "}
          Vale conferir se as pessoas certas têm acesso.
        </p>
      )}

      {error && (
        <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-white shadow-card" />
          ))}
        </div>
      ) : modules.length === 0 ? (
        <EmptyState icon={<Blocks size={20} />} title="Nenhum módulo contratado" description="Este órgão ainda não contratou módulos." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => {
            const v = moduleVisual(m.slug);
            const Icon = v.icon as LucideIcon;
            const counts = m.roles_count ?? Object.fromEntries(m.roles_in_use.map((r) => [r, 1]));
            const topRoles = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const maxRole = topRoles[0]?.[1] ?? 1;
            const unused = m.is_active && (m.accesses_30d ?? 0) === 0;
            const hasNews = m.slug in MODULE_NEWS;
            return (
              <article
                key={m.slug}
                className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-pop"
              >
                {/* Faixa do módulo */}
                <div className={`relative bg-gradient-to-br ${v.gradient} px-5 pb-5 pt-4 text-white`}>
                  <Icon
                    aria-hidden="true"
                    size={120}
                    strokeWidth={1}
                    className="pointer-events-none absolute -right-5 -top-6 opacity-10"
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 backdrop-blur ${
                        m.is_active ? "bg-white/15 ring-white/25" : "bg-black/20 ring-white/20"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${m.is_active ? "bg-[#73db9a]" : "bg-[#fbbf24]"}`} />
                      {m.status}
                    </span>
                  </div>
                  <h2 className="relative mt-3 text-lg font-bold leading-tight">{m.name}</h2>
                  <p className="relative flex items-center gap-2 text-xs text-white/75">
                    Versão {m.version}
                    {hasNews && (
                      <Link
                        href={`/novidades/${m.slug}`}
                        className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-semibold text-white ring-1 ring-white/25 hover:bg-white/25"
                      >
                        <Sparkles size={10} aria-hidden="true" /> Novidades
                      </Link>
                    )}
                  </p>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  {m.description && <p className="mb-4 line-clamp-2 text-sm text-muted">{m.description}</p>}

                  {/* Números */}
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <Metric icon={Users} label="Com acesso" value={String(m.users_with_grant)} />
                    <Metric
                      icon={Activity}
                      label="Usos 30 dias"
                      value={String(m.accesses_30d ?? 0)}
                      hint={m.active_users_30d ? `${m.active_users_30d} pessoa(s)` : undefined}
                      warn={unused}
                    />
                    <Metric
                      icon={Clock}
                      label="Último uso"
                      value={m.last_access_at ? formatRelative(m.last_access_at).replace(/^Hoje, às /, "") : "—"}
                      title={m.last_access_at ? formatDateTime(m.last_access_at) : undefined}
                    />
                  </dl>

                  {/* Perfis em uso */}
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted">Perfis em uso</p>
                    {topRoles.length === 0 ? (
                      <p className="text-xs text-warning-ink">Ninguém tem acesso a este módulo ainda.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {topRoles.slice(0, 4).map(([role, n]) => (
                          <li key={role} className="flex items-center gap-2 text-xs">
                            <span className="w-28 shrink-0 truncate text-ink" title={role}>
                              {roleLabel(m.slug, role)}
                            </span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
                              <span className={`block h-full rounded-full bg-gradient-to-r ${v.gradient}`} style={{ width: `${(n / maxRole) * 100}%` }} />
                            </span>
                            <span className="w-5 shrink-0 text-right tabular-nums text-muted">{n}</span>
                          </li>
                        ))}
                        {topRoles.length > 4 && <li className="text-xs text-muted">+{topRoles.length - 4} perfis</li>}
                      </ul>
                    )}
                  </div>

                  {m.pending_review > 0 && (
                    <Link
                      href={`/acessos?modulo=${m.slug}`}
                      className="mt-4 flex items-center gap-2 rounded-xl bg-warning-soft/70 px-3 py-2 text-xs font-medium text-warning-ink hover:bg-warning-soft"
                    >
                      <AlertTriangle size={13} aria-hidden="true" />
                      {m.pending_review === 1 ? "1 acesso aguarda revisão" : `${m.pending_review} acessos aguardam revisão`}
                      <ArrowRight size={12} className="ml-auto" aria-hidden="true" />
                    </Link>
                  )}

                  {/* Ações */}
                  <div className="mt-auto flex gap-2 pt-5">
                    <Link
                      href={`/acessos?modulo=${m.slug}`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:border-ink/30"
                    >
                      <KeyRound size={13} aria-hidden="true" /> Gerenciar acessos
                    </Link>
                    {canOpen(m.slug) && (
                      <button
                        onClick={() => open(m)}
                        disabled={opening !== null}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-ink-soft disabled:opacity-70"
                      >
                        {opening === m.slug ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <ExternalLink size={13} aria-hidden="true" />
                        )}
                        Abrir
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="px-4 py-2.5">
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className={`text-xl font-bold tabular-nums leading-tight ${warn ? "text-warning-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  title,
  warn,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  title?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl bg-paper/70 px-2 py-2.5" title={title ?? hint}>
      <dt className="flex items-center justify-center gap-1 text-[10px] font-medium text-muted">
        <Icon size={11} aria-hidden="true" /> {label}
      </dt>
      <dd className={`mt-0.5 truncate text-sm font-bold tabular-nums ${warn ? "text-warning-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
