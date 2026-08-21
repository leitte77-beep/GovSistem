"use client";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import {
  Plus, Search, Pencil, Trash2, Users, UserCheck, UserX, ShieldCheck, Download, Upload,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, X, SlidersHorizontal,
  ToggleLeft, ToggleRight, Settings2, Loader2, RotateCcw,
} from "lucide-react";
import api, { getStoredToken } from "@/lib/api";
import toast from "react-hot-toast";

interface User {
  id: string;
  name: string;
  email: string;
  cpf?: string;
  phone?: string;
  organization_id?: string | null;
  is_platform_admin: boolean;
  is_organization_admin: boolean;
  platform_role?: string | null;
  is_active: boolean;
  created_at: string;
}

interface Org { id: string; name: string }

const PLATFORM_ROLES: { value: string; label: string; short: string }[] = [
  { value: "SUPER_ADMIN", label: "Super Admin — acesso total à plataforma", short: "Super Admin" },
  { value: "PLATFORM_ADMIN", label: "Admin da Plataforma — gerencia usuários e órgãos", short: "Admin Plataforma" },
  { value: "BILLING_MANAGER", label: "Gestor de Cobrança — gerencia planos e faturas", short: "Cobrança" },
  { value: "SUPPORT", label: "Suporte — atende tickets e auxilia usuários", short: "Suporte" },
  { value: "AUDITOR", label: "Auditor — consulta logs e auditoria", short: "Auditor" },
];

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-violet-50 text-violet-700 ring-violet-200",
  PLATFORM_ADMIN: "bg-primary-50 text-primary-700 ring-primary-200",
  BILLING_MANAGER: "bg-amber-50 text-amber-700 ring-amber-200",
  SUPPORT: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  AUDITOR: "bg-slate-50 text-slate-700 ring-slate-200",
};

const AVATAR_COLORS = [
  "bg-primary-100 text-primary-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700",
];

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function roleLabel(role?: string | null) {
  if (!role) return null;
  return PLATFORM_ROLES.find((r) => r.value === role)?.short ?? role;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

type SortField = "name" | "email" | "created_at" | "is_active";
type StatusFilter = "all" | "active" | "inactive";
type ProfileFilter = "all" | "admins" | "members";

const inputBase =
  "w-full px-3 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest text-sm text-on-surface outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-shadow";

export default function UsuariosPage() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, admins: 0 });

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [profile, setProfile] = useState<ProfileFilter>("all");
  const [orgFilter, setOrgFilter] = useState("");
  const [sort, setSort] = useState<SortField>("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [showFilters, setShowFilters] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [quickEdit, setQuickEdit] = useState<User | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const orgName = useCallback(
    (id?: string | null) => (id ? orgs.find((o) => o.id === id)?.name ?? "—" : "—"),
    [orgs]
  );

  /* ---------------------------------------------------------------- data */

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort,
      order,
    });
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("is_active", status === "active" ? "true" : "false");
    if (profile !== "all") params.set("is_platform_admin", profile === "admins" ? "true" : "false");
    if (orgFilter) params.set("organization_id", orgFilter);
    return params.toString();
  }, [page, perPage, sort, order, search, status, profile, orgFilter]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: User[]; total: number }>(`/users?${buildQuery()}`);
      setUsers(res.data);
      setTotal(res.total);
    } catch {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const [all, active, admins] = await Promise.all([
        api<{ total: number }>("/users?per_page=1"),
        api<{ total: number }>("/users?per_page=1&is_active=true"),
        api<{ total: number }>("/users?per_page=1&is_platform_admin=true"),
      ]);
      setStats({
        total: all.total,
        active: active.total,
        inactive: all.total - active.total,
        admins: admins.total,
      });
    } catch { /* nao critico */ }
  }, []);

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await api<{ data: Org[] }>("/organizations?per_page=200");
      setOrgs(res.data ?? []);
    } catch { /* nao critico */ }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchStats(); fetchOrgs(); }, [fetchStats, fetchOrgs]);

  // busca com debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // pre-filtro por orgao vindo da tela de Organizacoes (/usuarios?org=<id>)
  useEffect(() => {
    const org = new URLSearchParams(window.location.search).get("org");
    if (org) {
      setOrgFilter(org);
      setShowFilters(true);
    }
  }, []);

  // atalho "/" para focar a busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refresh = useCallback(() => { fetchUsers(); fetchStats(); }, [fetchUsers, fetchStats]);

  /* ------------------------------------------------------------- actions */

  const toggleSort = (field: SortField) => {
    if (sort === field) setOrder(order === "asc" ? "desc" : "asc");
    else { setSort(field); setOrder("asc"); }
    setPage(1);
  };

  const toggleActive = async (user: User) => {
    setTogglingId(user.id);
    try {
      await api(`/users/${user.id}`, { method: "PUT", body: { is_active: !user.is_active } });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u)));
      toast.success(user.is_active ? "Usuário desativado" : "Usuário ativado");
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Usuário excluído com sucesso!");
      setDeleteTarget(null);
      setSelected((prev) => prev.filter((id) => id !== deleteTarget.id));
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  };

  const runBulk = async (fn: (id: string) => Promise<unknown>, successMsg: string) => {
    setBusy(true);
    const results = await Promise.allSettled(selected.map(fn));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) toast.error(`${failed} de ${selected.length} falharam.`);
    if (failed < selected.length) toast.success(`${selected.length - failed} ${successMsg}`);
    setSelected([]);
    setBulkDelete(false);
    setBusy(false);
    refresh();
  };

  const bulkSetActive = (value: boolean) =>
    runBulk(
      (id) => api(`/users/${id}`, { method: "PUT", body: { is_active: value } }),
      value ? "usuários ativados." : "usuários desativados."
    );

  const bulkRemove = () =>
    runBulk((id) => api(`/users/${id}`, { method: "DELETE" }), "usuários excluídos.");

  const handleExport = async () => {
    const toastId = toast.loading("Gerando CSV...");
    try {
      const token = getStoredToken();
      const res = await fetch("/api/v1/users/export/csv", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Falha ao exportar");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "usuarios.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("CSV exportado!", { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Erro ao exportar", { id: toastId });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const toastId = toast.loading("Importando usuários...");
    try {
      const result = await api<{ created: number; skipped: number; errors: string[] }>("/users/import/csv", {
        method: "POST",
        body: formData,
        headers: {},
      });
      let msg = `${result.created} usuários criados.`;
      if (result.skipped > 0) msg += ` ${result.skipped} ignorados.`;
      toast.success(msg, { id: toastId });
      if (result.errors.length > 0) {
        console.warn("Import errors:", result.errors);
        if (result.errors.length <= 3) result.errors.forEach((err: string) => toast.error(err));
        else toast.error(`${result.errors.length} erros. Consulte o console.`);
      }
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar", { id: toastId });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setProfile("all");
    setOrgFilter("");
    setPage(1);
  };

  /* -------------------------------------------------------------- derived */

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const hasFilters = !!search || status !== "all" || profile !== "all" || !!orgFilter;
  const allSelected = users.length > 0 && users.every((u) => selected.includes(u.id));

  const pageNumbers = useMemo(() => {
    const out: (number | string)[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) out.push(i);
      else if (out[out.length - 1] !== "...") out.push("...");
    }
    return out;
  }, [totalPages, page]);

  // se a pagina atual ficar vazia apos exclusoes, volta uma pagina
  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  const toggleSelectAll = () =>
    setSelected(allSelected ? selected.filter((id) => !users.some((u) => u.id === id)) : [...new Set([...selected, ...users.map((u) => u.id)])]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const SortHeader = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th className={`px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider ${className}`}>
      <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-on-surface transition-colors">
        {children}
        {sort === field ? (
          order === "asc" ? <ChevronUp size={13} className="text-primary-600" /> : <ChevronDown size={13} className="text-primary-600" />
        ) : (
          <ChevronsUpDown size={13} className="text-on-surface-variant/40" />
        )}
      </button>
    </th>
  );

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
    <AppLayout title="Usuários">
      {/* Cabecalho */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">Usuários</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Gerencie permissões e perfis de acesso da plataforma.
          </p>
        </div>
        <button
          onClick={() => router.push("/usuarios/new")}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 text-on-primary rounded-lg text-sm font-semibold hover:bg-primary-700 active:scale-[0.98] transition-all shadow-md shadow-primary-600/20"
        >
          <Plus size={16} />
          Novo Usuário
        </button>
      </div>

      {/* Indicadores clicaveis (funcionam como filtro rapido) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon={<Users size={20} />} label="Total de usuários" value={stats.total}
          tone="bg-primary-100 text-primary-600"
          active={!hasFilters}
          onClick={clearFilters}
        />
        <StatCard
          icon={<UserCheck size={20} />} label="Ativos" value={stats.active}
          tone="bg-emerald-100 text-emerald-600"
          active={status === "active"}
          onClick={() => { setStatus(status === "active" ? "all" : "active"); setPage(1); }}
        />
        <StatCard
          icon={<UserX size={20} />} label="Inativos" value={stats.inactive}
          tone="bg-rose-100 text-rose-600"
          active={status === "inactive"}
          onClick={() => { setStatus(status === "inactive" ? "all" : "inactive"); setPage(1); }}
        />
        <StatCard
          icon={<ShieldCheck size={20} />} label="Administradores" value={stats.admins}
          tone="bg-violet-100 text-violet-600"
          active={profile === "admins"}
          onClick={() => { setProfile(profile === "admins" ? "all" : "admins"); setPage(1); }}
        />
      </div>

      <Card padding={false}>
        {/* Barra de ferramentas */}
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-outline-variant">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Buscar por nome, e-mail ou CPF..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={`${inputBase} pl-9 pr-16`}
              />
              {searchInput ? (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container-low"
                  title="Limpar busca"
                >
                  <X size={15} />
                </button>
              ) : (
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant/70 border border-outline-variant rounded bg-surface-container-low hidden sm:block">
                  /
                </kbd>
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
                    {[search, status !== "all", profile !== "all", orgFilter].filter(Boolean).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-3.5 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                <Upload size={16} />
                <span className="hidden sm:inline">Importar</span>
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3.5 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Exportar</span>
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t border-outline-variant/60">
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Status</label>
                <select value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }} className={inputBase}>
                  <option value="all">Todos</option>
                  <option value="active">Somente ativos</option>
                  <option value="inactive">Somente inativos</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Perfil</label>
                <select value={profile} onChange={(e) => { setProfile(e.target.value as ProfileFilter); setPage(1); }} className={inputBase}>
                  <option value="all">Todos</option>
                  <option value="admins">Admins da plataforma</option>
                  <option value="members">Usuários comuns</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Órgão</label>
                <select value={orgFilter} onChange={(e) => { setOrgFilter(e.target.value); setPage(1); }} className={inputBase}>
                  <option value="">Todos os órgãos</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Por página</label>
                <div className="flex gap-2">
                  <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className={inputBase}>
                    {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
                  </select>
                  {hasFilters && (
                    <button
                      onClick={clearFilters}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors"
                      title="Limpar filtros"
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Barra de acoes em massa */}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-2.5 bg-primary-50 border-b border-primary-200">
            <span className="text-sm font-semibold text-primary-800">
              {selected.length} {selected.length === 1 ? "selecionado" : "selecionados"}
            </span>
            <div className="flex-1" />
            <button onClick={() => bulkSetActive(true)} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors">
              <ToggleRight size={16} /> Ativar
            </button>
            <button onClick={() => bulkSetActive(false)} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors">
              <ToggleLeft size={16} /> Desativar
            </button>
            <button onClick={() => setBulkDelete(true)} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors">
              <Trash2 size={16} /> Excluir
            </button>
            <button onClick={() => setSelected([])}
              className="p-1.5 rounded-lg text-primary-700 hover:bg-primary-100 transition-colors" title="Limpar selecao">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Tabela (desktop) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low">
                <th className="pl-5 pr-2 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-outline text-primary-600 focus:ring-primary-500 cursor-pointer"
                    title="Selecionar todos desta página"
                  />
                </th>
                <SortHeader field="name">Usuário</SortHeader>
                <th className="px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Órgão</th>
                <th className="px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Perfil</th>
                <SortHeader field="is_active">Status</SortHeader>
                <SortHeader field="created_at" className="hidden xl:table-cell">Criado em</SortHeader>
                <th className="px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    <td className="pl-5 pr-2 py-4"><div className="w-4 h-4 bg-surface-container-high rounded" /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-surface-container-high" />
                        <div className="space-y-1.5">
                          <div className="h-3 w-36 bg-surface-container-high rounded" />
                          <div className="h-2.5 w-48 bg-surface-container-high/70 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4"><div className="h-3 w-24 bg-surface-container-high rounded" /></td>
                    <td className="px-5 py-4"><div className="h-5 w-20 bg-surface-container-high rounded-lg" /></td>
                    <td className="px-5 py-4"><div className="h-5 w-16 bg-surface-container-high rounded-lg" /></td>
                    <td className="px-5 py-4 hidden xl:table-cell"><div className="h-3 w-20 bg-surface-container-high rounded" /></td>
                    <td className="px-5 py-4"><div className="h-6 w-20 bg-surface-container-high rounded ml-auto" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
                        <Users size={26} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          {hasFilters ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1">
                          {hasFilters ? "Tente ajustar a busca ou os filtros." : "Cadastre o primeiro usuário da plataforma."}
                        </p>
                      </div>
                      {hasFilters ? (
                        <button onClick={clearFilters} className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-low">
                          <RotateCcw size={15} /> Limpar filtros
                        </button>
                      ) : (
                        <button onClick={() => router.push("/usuarios/new")} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-on-primary rounded-lg text-sm font-semibold hover:bg-primary-700">
                          <Plus size={15} /> Novo Usuário
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const checked = selected.includes(user.id);
                  return (
                    <tr
                      key={user.id}
                      onDoubleClick={() => setQuickEdit(user)}
                      className={`group transition-colors ${checked ? "bg-primary-50/50" : "hover:bg-surface-container-low"}`}
                    >
                      <td className="pl-5 pr-2 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(user.id)}
                          className="w-4 h-4 rounded border-outline text-primary-600 focus:ring-primary-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs shrink-0 ${avatarColor(user.id)}`}>
                            {getInitials(user.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-on-surface truncate">{user.name}</p>
                            <p className="text-xs text-on-surface-variant truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-on-surface-variant max-w-[200px] truncate">
                        {orgName(user.organization_id)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {user.is_platform_admin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                              <ShieldCheck size={11} /> Admin
                            </span>
                          )}
                          {user.platform_role && (
                            <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-semibold ring-1 ${ROLE_STYLES[user.platform_role] ?? "bg-slate-50 text-slate-700 ring-slate-200"}`}>
                              {roleLabel(user.platform_role)}
                            </span>
                          )}
                          {!user.is_platform_admin && !user.platform_role && (
                            <span className="text-xs text-on-surface-variant">Usuário</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleActive(user)}
                          disabled={togglingId === user.id}
                          title={user.is_active ? "Clique para desativar" : "Clique para ativar"}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase transition-colors disabled:opacity-60 ${
                            user.is_active
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-red-100 text-red-700 hover:bg-red-200"
                          }`}
                        >
                          {togglingId === user.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-emerald-600" : "bg-red-600"}`} />
                          )}
                          {user.is_active ? "Ativo" : "Inativo"}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-sm text-on-surface-variant hidden xl:table-cell whitespace-nowrap">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setQuickEdit(user)}
                            className="p-1.5 text-on-surface-variant hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                            title="Edição rápida"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => router.push(`/usuarios/${user.id}/edit`)}
                            className="p-1.5 text-on-surface-variant hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                            title="Editar permissões e módulos"
                          >
                            <Settings2 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(user)}
                            className="p-1.5 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Cards (mobile) */}
        <div className="md:hidden divide-y divide-outline-variant">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`mk-${i}`} className="p-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-container-high" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-surface-container-high rounded" />
                  <div className="h-2.5 w-44 bg-surface-container-high/70 rounded" />
                </div>
              </div>
            ))
          ) : users.length === 0 ? (
            <div className="p-10 text-center text-sm text-on-surface-variant">
              {hasFilters ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}
            </div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(user.id)}
                    onChange={() => toggleSelect(user.id)}
                    className="mt-1 w-4 h-4 rounded border-outline text-primary-600 focus:ring-primary-500"
                  />
                  <div className={`w-10 h-10 rounded-full font-bold flex items-center justify-center text-xs shrink-0 ${avatarColor(user.id)}`}>
                    {getInitials(user.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface truncate">{user.name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{user.email}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <button
                        onClick={() => toggleActive(user)}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                          user.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-emerald-600" : "bg-red-600"}`} />
                        {user.is_active ? "Ativo" : "Inativo"}
                      </button>
                      {user.is_platform_admin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                          <ShieldCheck size={11} /> Admin
                        </span>
                      )}
                      {user.organization_id && (
                        <span className="text-[11px] text-on-surface-variant truncate">{orgName(user.organization_id)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => setQuickEdit(user)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant">
                    <Pencil size={14} /> Editar
                  </button>
                  <button onClick={() => router.push(`/usuarios/${user.id}/edit`)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant">
                    <Settings2 size={14} /> Permissões
                  </button>
                  <button onClick={() => setDeleteTarget(user)} className="px-3 py-2 border border-outline-variant rounded-lg text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Paginacao */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-outline-variant">
          <p className="text-xs text-on-surface-variant">
            {total === 0 ? "Nenhum resultado" : <>Mostrando <strong className="text-on-surface">{from}-{to}</strong> de <strong className="text-on-surface">{total}</strong> usuários</>}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors disabled:opacity-30"
                title="Página anterior"
              >
                <ChevronLeft size={18} />
              </button>
              {pageNumbers.map((p, i) =>
                p === "..." ? (
                  <span key={`dots-${i}`} className="px-2 text-on-surface-variant text-xs">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                      page === p ? "bg-primary-600 text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors disabled:opacity-30"
                title="Próxima página"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Edicao rapida */}
      <QuickEditModal
        user={quickEdit}
        orgs={orgs}
        onClose={() => setQuickEdit(null)}
        onSaved={(updated) => {
          setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
          setQuickEdit(null);
          refresh();
        }}
      />

      {/* Exclusao individual */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Excluir usuário" size="sm">
        <p className="text-on-surface-variant mb-2">
          Tem certeza que deseja excluir <strong className="text-on-surface">{deleteTarget?.name}</strong>?
        </p>
        <p className="text-xs text-on-surface-variant mb-5">{deleteTarget?.email}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm border border-outline-variant rounded-lg hover:bg-surface-container-low text-on-surface-variant">
            Cancelar
          </button>
          <button onClick={handleDelete} disabled={busy} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
            {busy ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </Modal>

      {/* Exclusao em massa */}
      <Modal open={bulkDelete} onClose={() => setBulkDelete(false)} title="Excluir usuários" size="sm">
        <p className="text-on-surface-variant mb-5">
          Excluir <strong className="text-on-surface">{selected.length}</strong> {selected.length === 1 ? "usuário selecionado" : "usuários selecionados"}? Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setBulkDelete(false)} className="px-4 py-2 text-sm border border-outline-variant rounded-lg hover:bg-surface-container-low text-on-surface-variant">
            Cancelar
          </button>
          <button onClick={bulkRemove} disabled={busy} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
            {busy ? "Excluindo..." : "Excluir todos"}
          </button>
        </div>
      </Modal>

      <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
    </AppLayout>
  );
}

/* ------------------------------------------------------- edicao rapida */

function QuickEditModal({
  user, orgs, onClose, onSaved,
}: {
  user: User | null;
  orgs: Org[];
  onClose: () => void;
  onSaved: (u: User) => void;
}) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", organization_id: "",
    platform_role: "", is_platform_admin: false, is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      organization_id: user.organization_id ?? "",
      platform_role: user.platform_role ?? "",
      is_platform_admin: user.is_platform_admin,
      is_active: user.is_active,
    });
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (!form.name.trim()) { toast.error("Informe o nome"); return; }
    if (!form.email.trim()) { toast.error("Informe o e-mail"); return; }
    setSaving(true);
    try {
      const updated = await api<User>(`/users/${user.id}`, {
        method: "PUT",
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          organization_id: form.organization_id || null,
          platform_role: form.platform_role || null,
          is_platform_admin: form.is_platform_admin,
          is_active: form.is_active,
        },
      });
      toast.success("Usuário atualizado!");
      onSaved(updated ?? { ...user, ...form } as User);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title="Edição rápida" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputBase} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">E-mail</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputBase} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Telefone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputBase} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Órgão</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className={inputBase}>
              <option value="">Sem órgão vinculado</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Função</label>
            <select value={form.platform_role} onChange={(e) => setForm({ ...form, platform_role: e.target.value })} className={inputBase}>
              <option value="">Sem função definida</option>
              {PLATFORM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.short}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-3 p-3 rounded-xl border border-outline-variant hover:bg-surface-container-low cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-outline text-primary-600 focus:ring-primary-500" />
            <div>
              <p className="text-sm font-semibold text-on-surface">Usuário ativo</p>
              <p className="text-xs text-on-surface-variant">Pode acessar a plataforma.</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-outline-variant hover:bg-surface-container-low cursor-pointer">
            <input type="checkbox" checked={form.is_platform_admin} onChange={(e) => setForm({ ...form, is_platform_admin: e.target.checked })}
              className="w-4 h-4 rounded border-outline text-primary-600 focus:ring-primary-500" />
            <div>
              <p className="text-sm font-semibold text-on-surface">Admin da plataforma</p>
              <p className="text-xs text-on-surface-variant">Acesso total às configurações.</p>
            </div>
          </label>
        </div>

        <p className="text-xs text-on-surface-variant">
          Para permissões por módulo e senha, use <strong className="text-on-surface">Editar permissões</strong>.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-outline-variant rounded-lg hover:bg-surface-container-low text-on-surface-variant">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 disabled:opacity-50 font-semibold">
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
