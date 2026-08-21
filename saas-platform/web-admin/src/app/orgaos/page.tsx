"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import {
  Plus, Search, X, SlidersHorizontal, RotateCcw, Building2, CheckCircle2, PauseCircle,
  Users, Pencil, Trash2, Power, PowerOff, Copy, Check, Loader2, ChevronLeft, ChevronRight,
  ExternalLink, Blocks,
} from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface OrgModule { slug: string; name: string }

interface Organization {
  id: string;
  name: string;
  slug: string;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  user_count: number;
  active_user_count: number;
  modules: OrgModule[];
}

const MODULE_STYLES: Record<string, string> = {
  diario: "bg-amber-50 text-amber-700 ring-amber-200",
  chatgov: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  govtask: "bg-primary-50 text-primary-700 ring-primary-200",
  govsocial: "bg-rose-50 text-rose-700 ring-rose-200",
  govdoc: "bg-violet-50 text-violet-700 ring-violet-200",
  govpro: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  financeiro: "bg-teal-50 text-teal-700 ring-teal-200",
  govcompras: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  govavalia: "bg-orange-50 text-orange-700 ring-orange-200",
};

const LOGO_TONES = [
  "bg-primary-100 text-primary-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
];

function orgTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return LOGO_TONES[hash % LOGO_TONES.length];
}

function orgInitials(name: string) {
  const skip = new Set(["de", "da", "do", "das", "dos", "e", "municipal", "prefeitura", "secretaria"]);
  const parts = name.trim().split(/\s+/).filter((p) => !skip.has(p.toLowerCase()));
  const source = parts.length ? parts : name.trim().split(/\s+/);
  if (source.length === 1) return source[0].slice(0, 2).toUpperCase();
  return (source[0][0] + source[source.length - 1][0]).toUpperCase();
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

type StatusFilter = "all" | "active" | "inactive";
type SortField = "name" | "created_at" | "is_active";

const inputBase =
  "w-full px-3 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest text-sm text-on-surface outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-shadow";

export default function OrganizacoesPage() {
  const router = useRouter();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, users: 0 });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [moduleFilter, setModuleFilter] = useState("");
  const [sort, setSort] = useState<SortField>("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [showFilters, setShowFilters] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /* ---------------------------------------------------------------- data */

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort, order });
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("is_active", status === "active" ? "true" : "false");
      const res = await api<{ data: Organization[]; total: number }>(`/organizations?${params}`);
      setOrgs(res.data || []);
      setTotal(res.total || 0);
    } catch {
      toast.error("Erro ao carregar organizações");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, sort, order, search, status]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api<{ data: Organization[]; total: number }>("/organizations?per_page=200");
      const all = res.data || [];
      setStats({
        total: res.total || all.length,
        active: all.filter((o) => o.is_active).length,
        inactive: all.filter((o) => !o.is_active).length,
        users: all.reduce((acc, o) => acc + (o.user_count || 0), 0),
      });
    } catch { /* nao critico */ }
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const refresh = useCallback(() => { fetchOrgs(); fetchStats(); }, [fetchOrgs, fetchStats]);

  /* ------------------------------------------------------------- actions */

  const toggleActive = async (org: Organization) => {
    setTogglingId(org.id);
    try {
      await api(`/organizations/${org.id}`, { method: "PUT", body: { is_active: !org.is_active } });
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, is_active: !o.is_active } : o)));
      toast.success(org.is_active ? "Organização desativada" : "Organização ativada");
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/organizations/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Organização excluída com sucesso!");
      setDeleteTarget(null);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const copySlug = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(slug);
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const clearFilters = () => {
    setSearchInput(""); setSearch(""); setStatus("all"); setModuleFilter(""); setPage(1);
  };

  /* -------------------------------------------------------------- derived */

  const moduleOptions = useMemo(() => {
    const map = new Map<string, string>();
    orgs.forEach((o) => o.modules?.forEach((m) => map.set(m.slug, m.name)));
    return Array.from(map, ([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs]);

  const visibleOrgs = useMemo(
    () => (moduleFilter ? orgs.filter((o) => o.modules?.some((m) => m.slug === moduleFilter)) : orgs),
    [orgs, moduleFilter]
  );

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const hasFilters = !!search || status !== "all" || !!moduleFilter;

  useEffect(() => { if (!loading && page > totalPages) setPage(totalPages); }, [loading, page, totalPages]);

  const StatCard = ({ icon, label, value, tone, active, onClick }: {
    icon: React.ReactNode; label: string; value: number; tone: string; active: boolean; onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
        active
          ? "border-primary-500 bg-primary-50/60 ring-2 ring-primary-500/20"
          : "border-outline-variant bg-surface-container-lowest hover:border-outline hover:shadow-sm"
      }`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-on-surface-variant font-medium truncate">{label}</p>
        <p className="text-xl font-bold text-on-surface leading-tight">{value}</p>
      </div>
    </button>
  );

  /* ----------------------------------------------------------------- view */

  return (
    <AppLayout title="Organizações">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary-600/70 mb-1">Administração</p>
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">Organizações</h1>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
            Prefeituras e órgãos integrados à plataforma. Gerencie instâncias, módulos e acessos.
          </p>
        </div>
        <button
          onClick={() => router.push("/orgaos/new")}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 text-on-primary rounded-lg text-sm font-semibold hover:bg-primary-700 active:scale-[0.98] transition-all shadow-md shadow-primary-600/20"
        >
          <Plus size={16} />
          Nova Organização
        </button>
      </div>

      {/* Indicadores / filtros rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={<Building2 size={20} />} label="Organizações" value={stats.total}
          tone="bg-primary-100 text-primary-600" active={!hasFilters} onClick={clearFilters} />
        <StatCard icon={<CheckCircle2 size={20} />} label="Ativas" value={stats.active}
          tone="bg-emerald-100 text-emerald-600" active={status === "active"}
          onClick={() => { setStatus(status === "active" ? "all" : "active"); setPage(1); }} />
        <StatCard icon={<PauseCircle size={20} />} label="Inativas" value={stats.inactive}
          tone="bg-rose-100 text-rose-600" active={status === "inactive"}
          onClick={() => { setStatus(status === "inactive" ? "all" : "inactive"); setPage(1); }} />
        <StatCard icon={<Users size={20} />} label="Usuários vinculados" value={stats.users}
          tone="bg-violet-100 text-violet-600" active={false}
          onClick={() => router.push("/usuarios")} />
      </div>

      {/* Barra de ferramentas */}
      <Card padding={false} className="mb-5">
        <div className="px-4 sm:px-5 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Buscar por nome, slug ou CNPJ..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={`${inputBase} pl-9 pr-10`}
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container-low"
                  title="Limpar busca"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center gap-2 px-3.5 py-2 border rounded-lg text-sm font-medium transition-colors ${
                  showFilters || hasFilters
                    ? "border-primary-300 bg-primary-50 text-primary-700"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                <SlidersHorizontal size={16} />
                Filtros
                {hasFilters && (
                  <span className="w-5 h-5 rounded-full bg-primary-600 text-on-primary text-[10px] font-bold flex items-center justify-center">
                    {[search, status !== "all", moduleFilter].filter(Boolean).length}
                  </span>
                )}
              </button>
              <select
                value={`${sort}:${order}`}
                onChange={(e) => {
                  const [s, o] = e.target.value.split(":");
                  setSort(s as SortField); setOrder(o as "asc" | "desc"); setPage(1);
                }}
                className={`${inputBase} w-auto`}
                title="Ordenar"
              >
                <option value="name:asc">Nome (A-Z)</option>
                <option value="name:desc">Nome (Z-A)</option>
                <option value="created_at:desc">Mais recentes</option>
                <option value="created_at:asc">Mais antigas</option>
                <option value="is_active:desc">Ativas primeiro</option>
              </select>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-outline-variant/60">
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Status</label>
                <select value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }} className={inputBase}>
                  <option value="all">Todas</option>
                  <option value="active">Somente ativas</option>
                  <option value="inactive">Somente inativas</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Módulo contratado</label>
                <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className={inputBase}>
                  <option value="">Todos os módulos</option>
                  {moduleOptions.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Por página</label>
                <div className="flex gap-2">
                  <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className={inputBase}>
                    {[12, 24, 48].map((n) => <option key={n} value={n}>{n} por página</option>)}
                  </select>
                  {hasFilters && (
                    <button onClick={clearFilters} title="Limpar filtros"
                      className="shrink-0 px-3 py-2 border border-outline-variant rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors">
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Lista */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface-container-lowest rounded-xl border border-outline-variant p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-surface-container-high" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-52 bg-surface-container-high rounded" />
                  <div className="h-3 w-32 bg-surface-container-high/70 rounded" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                {[1, 2, 3].map((k) => <div key={k} className="h-5 w-20 bg-surface-container-high rounded-lg" />)}
              </div>
            </div>
          ))}
        </div>
      ) : visibleOrgs.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
              <Building2 size={26} />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">
                {hasFilters ? "Nenhuma organização encontrada" : "Nenhuma organização cadastrada"}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                {hasFilters ? "Tente ajustar a busca ou os filtros." : "Cadastre a primeira prefeitura ou órgão."}
              </p>
            </div>
            {hasFilters ? (
              <button onClick={clearFilters} className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-low">
                <RotateCcw size={15} /> Limpar filtros
              </button>
            ) : (
              <button onClick={() => router.push("/orgaos/new")} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-on-primary rounded-lg text-sm font-semibold hover:bg-primary-700">
                <Plus size={15} /> Nova Organização
              </button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visibleOrgs.map((org) => (
            <div
              key={org.id}
              className={`group bg-surface-container-lowest rounded-xl border p-5 transition-all hover:shadow-md ${
                org.is_active ? "border-outline-variant" : "border-outline-variant bg-surface-container-low/40"
              }`}
            >
              {/* Cabecalho do card */}
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 font-extrabold text-lg ${orgTone(org.slug)} ${org.is_active ? "" : "grayscale opacity-70"}`}>
                  {org.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logo_url} alt={org.name} className="w-full h-full object-contain rounded-xl" />
                  ) : (
                    orgInitials(org.name)
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-on-surface leading-snug break-words" title={org.name}>
                      {org.name}
                    </h3>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      org.is_active ? "bg-emerald-100 text-emerald-700" : "bg-surface-container-high text-on-surface-variant"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${org.is_active ? "bg-emerald-600" : "bg-on-surface-variant/50"}`} />
                      {org.is_active ? "Ativa" : "Inativa"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap mt-1.5">
                    <button
                      onClick={() => copySlug(org.slug)}
                      title="Copiar identificador"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[11px] text-on-surface-variant bg-surface-container-low hover:bg-surface-container-high transition-colors"
                    >
                      {copied === org.slug ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                      {org.slug}
                    </button>
                    {org.cnpj && <span className="text-[11px] text-on-surface-variant">CNPJ {org.cnpj}</span>}
                    <span className="text-[11px] text-on-surface-variant">Desde {formatDate(org.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Métricas + módulos */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4 pt-4 border-t border-outline-variant/70">
                <button
                  onClick={() => router.push(`/usuarios?org=${org.id}`)}
                  className="flex items-center gap-2 text-left group/users"
                  title="Ver usuários deste órgão"
                >
                  <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-on-surface-variant group-hover/users:bg-primary-50 group-hover/users:text-primary-600 transition-colors">
                    <Users size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface leading-none">
                      {org.user_count}
                      <span className="text-[11px] font-medium text-on-surface-variant ml-1">
                        {org.user_count === 1 ? "usuário" : "usuários"}
                      </span>
                    </p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      {org.active_user_count} {org.active_user_count === 1 ? "ativo" : "ativos"}
                    </p>
                  </div>
                </button>

                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-on-surface-variant shrink-0">
                    <Blocks size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-on-surface-variant mb-1">
                      {org.modules?.length ? `${org.modules.length} módulos ativos` : "Nenhum módulo ativo"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {org.modules?.length ? (
                        org.modules.map((m) => (
                          <span
                            key={m.slug}
                            className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-semibold ring-1 ${
                              MODULE_STYLES[m.slug] ?? "bg-slate-50 text-slate-700 ring-slate-200"
                            }`}
                          >
                            {m.name}
                          </span>
                        ))
                      ) : (
                        <button
                          onClick={() => router.push(`/orgaos/${org.id}/edit`)}
                          className="text-[11px] font-semibold text-primary-600 hover:underline"
                        >
                          Contratar módulos
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Acoes */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-outline-variant/70">
                <button
                  onClick={() => router.push(`/orgaos/${org.id}/edit`)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-primary-600 text-on-primary rounded-lg text-xs font-semibold hover:bg-primary-700 transition-colors"
                >
                  <Pencil size={14} /> Editar
                </button>
                <button
                  onClick={() => router.push(`/usuarios?org=${org.id}`)}
                  className="flex items-center gap-2 px-3.5 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors"
                >
                  <Users size={14} /> Usuários
                </button>
                <button
                  onClick={() => toggleActive(org)}
                  disabled={togglingId === org.id}
                  className={`flex items-center gap-2 px-3.5 py-2 border rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                    org.is_active
                      ? "border-outline-variant text-amber-700 hover:bg-amber-50"
                      : "border-outline-variant text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {togglingId === org.id ? <Loader2 size={14} className="animate-spin" /> : org.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                  {org.is_active ? "Desativar" : "Ativar"}
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setDeleteTarget(org)}
                  className="p-2 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Excluir organização"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginação */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5 px-4 sm:px-5 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl">
        <p className="text-xs text-on-surface-variant">
          {total === 0 ? "Nenhum resultado" : (
            <>
              Mostrando <strong className="text-on-surface">{from}-{to}</strong> de{" "}
              <strong className="text-on-surface">{total}</strong> organizações
              {moduleFilter && <span className="ml-1">({visibleOrgs.length} nesta página após o filtro de módulo)</span>}
            </>
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}
              className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors disabled:opacity-30" title="Página anterior">
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || (n >= page - 1 && n <= page + 1))
              .map((n, i, arr) => (
                <React.Fragment key={n}>
                  {i > 0 && n - arr[i - 1] > 1 && <span className="px-2 text-on-surface-variant text-xs">...</span>}
                  <button
                    onClick={() => setPage(n)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                      page === n ? "bg-primary-600 text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    {n}
                  </button>
                </React.Fragment>
              ))}
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
              className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors disabled:opacity-30" title="Próxima página">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Exclusão */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Excluir organização" size="sm">
        <p className="text-on-surface-variant mb-3">
          Tem certeza que deseja excluir <strong className="text-on-surface">{deleteTarget?.name}</strong>?
        </p>
        {!!deleteTarget?.user_count && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-xs mb-4">
            <ExternalLink size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>{deleteTarget.user_count}</strong> {deleteTarget.user_count === 1 ? "usuário ficará" : "usuários ficarão"} sem
              órgão vinculado e {deleteTarget.user_count === 1 ? "perderá" : "perderão"} o acesso aos módulos desta organização.
            </span>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm border border-outline-variant rounded-lg hover:bg-surface-container-low text-on-surface-variant">
            Cancelar
          </button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
