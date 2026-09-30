"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCcw,
  Search,
  UserMinus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import EmptyState from "@/components/empty-state";
import PendingReviewPanel from "@/components/pending-review-panel";
import { moduleVisual } from "@/components/module-card";
import { formatDateTime, formatRelative, initials } from "@/lib/format";

interface ContractedModule {
  slug: string;
  name: string;
  roles: Array<{ name: string; label: string }>;
}

interface ModuleUser {
  user_id: string;
  membership_id: string;
  name: string;
  email: string;
  position?: string | null;
  department?: string | null;
  membership_active: boolean;
  roles: string[];
  requires_review?: boolean;
  has_access?: boolean;
  last_access_at?: string | null;
}

interface PendingGrantsResponse {
  total: number;
  modules: Array<{ slug: string; name: string; count: number }>;
}

function roleTitle(label: string) {
  return label.split(/\s+[—–-]\s+/)[0];
}
function normalize(s?: string | null) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function AccessPage() {
  const router = useRouter();
  const [modules, setModules] = useState<ContractedModule[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [users, setUsers] = useState<ModuleUser[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingGrantsResponse | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showWithout, setShowWithout] = useState(false);
  const [accessCount, setAccessCount] = useState<Record<string, number>>({});

  // Módulos: carrega uma vez só. ?modulo=slug abre direto no módulo pedido.
  useEffect(() => {
    api<ContractedModule[]>("/tenant/roles")
      .then((mods) => {
        setModules(mods);
        const wanted = new URLSearchParams(window.location.search).get("modulo");
        setSelected(mods.find((m) => m.slug === wanted)?.slug ?? mods[0]?.slug ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar módulos"))
      .finally(() => setLoadingModules(false));
    api<Array<{ slug: string; users_with_grant: number }>>("/tenant/contracted-modules")
      .then((r) => setAccessCount(Object.fromEntries(r.map((m) => [m.slug, m.users_with_grant]))))
      .catch(() => {});
  }, []);

  const loadPending = useCallback(async () => {
    try {
      setPending(await api<PendingGrantsResponse>("/tenant/pending-grants"));
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const loadUsers = useCallback(async (slug: string) => {
    setLoadingUsers(true);
    setError("");
    try {
      const r = await api<{ users: ModuleUser[] }>(`/tenant/modules/${slug}/users`);
      setUsers(r.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar usuários");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadUsers(selected);
    setRoleFilter(null);
    setShowWithout(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("modulo", selected);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignora */
    }
  }, [selected, loadUsers]);

  const activeModule = modules.find((m) => m.slug === selected);
  const pendingTotal = pending?.total ?? 0;
  const roleName = (r: string) => {
    const found = activeModule?.roles.find((x) => x.name === r);
    return found ? roleTitle(found.label) : r;
  };

  const withAccess = useMemo(() => users.filter((u) => u.has_access ?? u.roles.length > 0), [users]);
  const without = useMemo(
    () => users.filter((u) => !(u.has_access ?? u.roles.length > 0) && u.membership_active),
    [users],
  );

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = {};
    withAccess.forEach((u) => u.roles.forEach((r) => (c[r] = (c[r] ?? 0) + 1)));
    return c;
  }, [withAccess]);

  const q = normalize(query.trim());
  const match = (u: ModuleUser) =>
    !q || [u.name, u.email, u.position, u.department].some((f) => normalize(f).includes(q));
  const shown = withAccess.filter((u) => (!roleFilter || u.roles.includes(roleFilter)) && match(u));
  const shownWithout = without.filter(match);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-ink">Acessos</h1>
          <p className="mt-1 text-sm text-muted">Quem pode usar cada módulo do órgão, e com qual perfil.</p>
        </div>
        <Link
          href="/usuarios"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30 hover:shadow-card"
        >
          <Users size={15} aria-hidden="true" /> Ver por pessoa
        </Link>
      </header>

      {pendingTotal > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-soft bg-gradient-to-r from-warning-soft/80 to-white p-4 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-warning-ink ring-1 ring-warning-soft">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">
                {pendingTotal === 1 ? "1 acesso aguarda" : `${pendingTotal} acessos aguardam`} sua revisão
              </p>
              <p className="text-xs text-muted">
                Acessos que vieram do sistema antigo e precisam de um perfil definido.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPanel(true)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft"
          >
            Revisar agora
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Módulos */}
        <nav aria-label="Módulos" className="lg:sticky lg:top-20 lg:self-start">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Módulos</h2>
          {loadingModules ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-white shadow-card" />
              ))}
            </div>
          ) : modules.length === 0 ? (
            <EmptyState title="Nenhum módulo" description="O órgão não tem módulos com perfis configuráveis." />
          ) : (
            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {modules.map((m) => {
                const v = moduleVisual(m.slug);
                const Icon = v.icon as LucideIcon;
                const active = selected === m.slug;
                const modPending = pending?.modules.find((p) => p.slug === m.slug)?.count ?? 0;
                const n = accessCount[m.slug];
                return (
                  <li key={m.slug} className="shrink-0 lg:shrink">
                    <button
                      onClick={() => setSelected(m.slug)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                        active
                          ? "border-ink bg-white shadow-card ring-1 ring-ink"
                          : "border-line bg-white hover:border-ink/25 hover:shadow-card"
                      }`}
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${v.gradient}`}>
                        <Icon size={18} className="text-white" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{m.name}</span>
                        <span className="block text-xs text-muted">
                          {n === undefined ? `${m.roles.length} perfis` : n === 1 ? "1 pessoa" : `${n} pessoas`}
                        </span>
                      </span>
                      {modPending > 0 && (
                        <span
                          title={`${modPending} acesso(s) aguardando revisão`}
                          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning-ink"
                        >
                          <AlertTriangle size={10} aria-hidden="true" /> {modPending}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* Pessoas do módulo */}
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {activeModule && (
            <div className="border-b border-line px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {(() => {
                    const v = moduleVisual(activeModule.slug);
                    const Icon = v.icon as LucideIcon;
                    return (
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm ${v.gradient}`}>
                        <Icon size={20} className="text-white" aria-hidden="true" />
                      </span>
                    );
                  })()}
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold tracking-tight text-ink">{activeModule.name}</h2>
                    <p className="text-xs text-muted">
                      {loadingUsers
                        ? "Carregando…"
                        : `${withAccess.length === 1 ? "1 pessoa tem" : `${withAccess.length} pessoas têm`} acesso`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    loadUsers(selected);
                    loadPending();
                  }}
                  aria-label="Atualizar"
                  title="Atualizar"
                  className="rounded-full p-2 text-muted transition hover:bg-paper hover:text-ink"
                >
                  <RefreshCcw size={15} className={loadingUsers ? "animate-spin" : ""} />
                </button>
              </div>

              {/* Perfis: filtro e resumo ao mesmo tempo */}
              {activeModule.roles.length > 0 && !loadingUsers && (
                <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por perfil">
                  <RoleChip active={!roleFilter} onClick={() => setRoleFilter(null)} label="Todos" count={withAccess.length} />
                  {activeModule.roles.map((r) => (
                    <RoleChip
                      key={r.name}
                      active={roleFilter === r.name}
                      onClick={() => setRoleFilter(roleFilter === r.name ? null : r.name)}
                      label={roleTitle(r.label)}
                      title={r.label}
                      count={roleCounts[r.name] ?? 0}
                    />
                  ))}
                </div>
              )}

              <label className="relative mt-3 block">
                <span className="sr-only">Buscar pessoa</span>
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome, e-mail, cargo ou setor"
                  className="w-full rounded-full border border-line bg-white py-2 pl-10 pr-9 text-sm text-ink placeholder:text-muted focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-paper hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
          )}

          {loadingUsers ? (
            <ul aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-0">
                  <span className="h-9 w-9 animate-pulse rounded-full bg-paper" />
                  <span className="h-3 w-48 animate-pulse rounded bg-paper" />
                </li>
              ))}
            </ul>
          ) : shown.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Users size={20} />}
                title={
                  withAccess.length === 0
                    ? "Ninguém tem acesso a este módulo"
                    : roleFilter
                      ? `Ninguém com o perfil ${roleName(roleFilter)}`
                      : "Ninguém encontrado"
                }
                description={
                  withAccess.length === 0
                    ? "Libere o acesso pela lista de pessoas sem acesso logo abaixo."
                    : "Tente outro perfil ou outro termo de busca."
                }
              />
            </div>
          ) : (
            <ul>
              {shown.map((u) => (
                <li key={u.user_id} className="group border-b border-line last:border-0">
                  <Link
                    href={`/usuarios/${u.user_id}/acessos`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-paper/70"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        u.membership_active ? "bg-[#E0EAFF] text-[#1D3A8A]" : "bg-paper text-muted"
                      }`}
                      aria-hidden="true"
                    >
                      {initials(u.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink">{u.name}</span>
                        {!u.membership_active && (
                          <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-ink">
                            Suspenso
                          </span>
                        )}
                        {u.requires_review && (
                          <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-ink">
                            Em revisão
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[u.position, u.department].filter(Boolean).join(" · ") || u.email}
                      </p>
                    </div>
                    <div className="hidden min-w-0 max-w-[40%] flex-wrap justify-end gap-1 sm:flex">
                      {u.roles.map((r) => (
                        <span
                          key={r}
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                            roleFilter === r ? "bg-ink text-white ring-ink" : "bg-paper text-ink ring-line"
                          }`}
                        >
                          {roleName(r)}
                        </span>
                      ))}
                    </div>
                    <span
                      className="hidden w-24 shrink-0 text-right text-xs text-muted md:block"
                      title={u.last_access_at ? formatDateTime(u.last_access_at) : undefined}
                    >
                      {u.last_access_at ? formatRelative(u.last_access_at) : "Nunca abriu"}
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-muted/60 transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
                  </Link>
                  {/* Perfis no celular */}
                  {u.roles.length > 0 && (
                    <div className="-mt-1 flex flex-wrap gap-1 px-5 pb-3 pl-[68px] sm:hidden">
                      {u.roles.map((r) => (
                        <span key={r} className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink ring-1 ring-line">
                          {roleName(r)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Sem acesso */}
          {!loadingUsers && without.length > 0 && (
            <div className="border-t border-line bg-paper/50">
              <button
                onClick={() => setShowWithout((v) => !v)}
                aria-expanded={showWithout}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <UserMinus size={15} className="text-muted" aria-hidden="true" />
                  {without.length === 1 ? "1 pessoa ativa sem acesso" : `${without.length} pessoas ativas sem acesso`}
                </span>
                <ChevronDown size={16} className={`text-muted transition ${showWithout ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {showWithout && (
                <ul className="border-t border-line bg-white">
                  {shownWithout.map((u) => (
                    <li key={u.user_id} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-[11px] font-bold text-muted" aria-hidden="true">
                        {initials(u.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{u.name}</p>
                        <p className="truncate text-xs text-muted">{u.email}</p>
                      </div>
                      <Link
                        href={`/usuarios/${u.user_id}/acessos`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/30"
                      >
                        <Plus size={12} aria-hidden="true" /> Liberar
                      </Link>
                    </li>
                  ))}
                  {shownWithout.length === 0 && (
                    <li className="px-5 py-3 text-xs text-muted">Ninguém corresponde à busca.</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <PendingReviewPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        onChange={() => {
          if (selected) loadUsers(selected);
          loadPending();
        }}
        onReviewUser={(userId) => {
          setShowPanel(false);
          router.push(`/usuarios/${userId}/acessos`);
        }}
      />
    </div>
  );
}

function RoleChip({
  active,
  onClick,
  label,
  count,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active ? "border-ink bg-ink text-white" : count ? "border-line bg-white text-ink hover:border-ink/30" : "border-line bg-white text-muted/70 hover:text-ink"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? "bg-white/20" : "bg-paper text-muted"}`}>{count}</span>
    </button>
  );
}

