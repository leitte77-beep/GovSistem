"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownAZ,
  Blocks,
  Clock,
  Eye,
  KeyRound,
  Lock,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserMinus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import Link from "next/link";
import ConfirmDialog from "@/components/confirm-dialog";
import EmptyState from "@/components/empty-state";
import { moduleVisual } from "@/components/module-card";
import { useToast } from "@/components/toast";
import { formatDateTime, formatRelative, initials } from "@/lib/format";

interface UserModule {
  slug: string;
  name: string;
  requires_review: boolean;
}

interface TenantUserRow {
  user_id: string;
  membership_id: string;
  name: string;
  email: string;
  phone?: string | null;
  global_active: boolean;
  membership_role: string;
  membership_active: boolean;
  position?: string | null;
  department?: string | null;
  created_at?: string | null;
  removed_at?: string | null;
  modules?: UserModule[];
  last_login_at?: string | null;
  must_change_password?: boolean;
  locked?: boolean;
}

type Action = "status" | "remove" | "restore";
type View = "all" | "active" | "suspended" | "managers" | "no_modules" | "removed";
type Sort = "name" | "recent";

const VIEWS: { key: View; label: string; icon: LucideIcon }[] = [
  { key: "all", label: "Todos", icon: Users },
  { key: "active", label: "Ativos", icon: UserCheck },
  { key: "suspended", label: "Suspensos", icon: UserMinus },
  { key: "managers", label: "Gestores", icon: ShieldCheck },
  { key: "no_modules", label: "Sem módulos", icon: Blocks },
  { key: "removed", label: "Removidos", icon: Trash2 },
];

// Cor estável por pessoa, para o avatar ajudar a reconhecer quem é quem.
const AVATAR_TONES = [
  "bg-[#E0EAFF] text-[#1D3A8A]",
  "bg-[#D1FADF] text-[#065F46]",
  "bg-[#FEF0C7] text-[#93370D]",
  "bg-[#F4EBFF] text-[#5B2172]",
  "bg-[#D1E9FF] text-[#0B3B5C]",
  "bg-[#FCE7F6] text-[#851651]",
];
function avatarTone(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function normalize(s?: string | null) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [removed, setRemoved] = useState<TenantUserRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ user: TenantUserRow; action: Action } | null>(null);
  const [menu, setMenu] = useState<{ user: TenantUserRow; top: number; left: number } | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api<{ data: TenantUserRow[] }>(`/tenant/users?per_page=200`);
      setUsers(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao listar usuários");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRemoved = useCallback(async () => {
    try {
      const r = await api<{ data: TenantUserRow[] }>(`/tenant/users?per_page=200&removed=true`);
      setRemoved(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao listar removidos");
      setRemoved([]);
    }
  }, []);

  useEffect(() => {
    load();
    loadRemoved();
  }, [load, loadRemoved]);

  // Atalho "/" foca a busca; Esc fecha o menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input,textarea,select");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((u) => u.membership_active).length,
      suspended: users.filter((u) => !u.membership_active).length,
      managers: users.filter((u) => u.membership_role === "ORG_ADMIN").length,
      no_modules: users.filter((u) => u.membership_active && (u.modules?.length ?? 0) === 0).length,
      removed: removed?.length ?? 0,
    }),
    [users, removed],
  );

  const visible = useMemo(() => {
    const base = view === "removed" ? removed ?? [] : users;
    const q = normalize(search.trim());
    const list = base.filter((u) => {
      if (view === "active" && !u.membership_active) return false;
      if (view === "suspended" && u.membership_active) return false;
      if (view === "managers" && u.membership_role !== "ORG_ADMIN") return false;
      if (view === "no_modules" && (!u.membership_active || (u.modules?.length ?? 0) > 0)) return false;
      if (!q) return true;
      return [u.name, u.email, u.position, u.department].some((f) => normalize(f).includes(q));
    });
    if (sort === "recent")
      return [...list].sort((a, b) => (b.last_login_at ?? "").localeCompare(a.last_login_at ?? ""));
    return list;
  }, [users, removed, view, search, sort]);

  const runAction = async (user: TenantUserRow, action: Action) => {
    setBusyAction(true);
    setError("");
    try {
      if (action === "status") {
        const updated = await api<{ is_active: boolean }>(`/tenant/users/${user.user_id}/status`, {
          method: "PATCH",
          body: { is_active: !user.membership_active },
        });
        setUsers((prev) =>
          prev.map((x) => (x.user_id === user.user_id ? { ...x, membership_active: updated.is_active } : x)),
        );
        toast(updated.is_active ? "success" : "info", updated.is_active ? "Usuário reativado." : "Usuário suspenso.");
      } else if (action === "remove") {
        await api(`/tenant/users/${user.user_id}`, { method: "DELETE" });
        setUsers((prev) => prev.filter((x) => x.user_id !== user.user_id));
        loadRemoved();
        toast("success", "Usuário removido deste órgão. Você pode restaurá-lo na aba Removidos.");
      } else if (action === "restore") {
        await api(`/tenant/users/${user.user_id}/restore`, { method: "POST" });
        await Promise.all([load(), loadRemoved()]);
        toast("success", "Usuário restaurado no órgão.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na operação";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusyAction(false);
      setConfirm(null);
    }
  };

  const confirmCopy = (c: { user: TenantUserRow; action: Action }) => {
    const n = c.user.name;
    if (c.action === "remove")
      return {
        title: "Remover do órgão",
        message: `Remover ${n} deste órgão? Os acessos aos módulos serão revogados. A conta e o histórico ficam preservados, e dá para restaurar depois na aba Removidos.`,
        label: "Remover",
        danger: true,
      };
    if (c.action === "restore")
      return {
        title: "Restaurar no órgão",
        message: `Restaurar ${n} neste órgão? O vínculo volta ativo, junto com os acessos que ele tinha quando foi removido.`,
        label: "Restaurar",
        danger: false,
      };
    return c.user.membership_active
      ? {
          title: "Suspender usuário",
          message: `Suspender ${n}? O acesso aos módulos deste órgão fica bloqueado até você reativar.`,
          label: "Suspender",
          danger: true,
        }
      : { title: "Reativar usuário", message: `Reativar ${n}?`, label: "Reativar", danger: false };
  };

  const openMenu = (u: TenantUserRow, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const height = 360;
    const top = r.bottom + height > window.innerHeight ? Math.max(r.top - height - 4, 8) : r.bottom + 4;
    setMenu(menu?.user.user_id === u.user_id ? null : { user: u, top, left: Math.max(r.right - 256, 8) });
  };

  const filtersActive = search.trim() !== "" || view !== "all";
  const isRemovedView = view === "removed";

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-ink">Usuários</h1>
          <p className="mt-1 text-sm text-muted">
            Quem tem acesso ao órgão, a quais módulos, e quando entrou pela última vez.
          </p>
        </div>
        <Link
          href="/usuarios/novo"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
        >
          <Plus size={16} aria-hidden="true" /> Novo usuário
        </Link>
      </header>

      {/* Visões (também servem de resumo) */}
      <div role="tablist" aria-label="Filtrar usuários" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {VIEWS.map((v) => {
          const active = view === v.key;
          const Icon = v.icon;
          const n = counts[v.key];
          const warn = v.key === "no_modules" && n > 0;
          return (
            <button
              key={v.key}
              role="tab"
              aria-selected={active}
              onClick={() => setView(v.key)}
              className={`group flex shrink-0 items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-left transition ${
                active
                  ? "border-ink bg-ink text-white shadow-card"
                  : "border-line bg-white text-ink hover:border-ink/25 hover:shadow-card"
              }`}
            >
              <Icon size={16} className={active ? "text-white/80" : warn ? "text-warning" : "text-muted"} aria-hidden="true" />
              <span className="text-sm font-medium">{v.label}</span>
              <span
                className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums ${
                  active ? "bg-white/15 text-white" : warn ? "bg-warning-soft text-warning-ink" : "bg-paper text-muted"
                }`}
              >
                {loading && v.key !== "removed" ? "·" : n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Busca e ordenação */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar usuário</span>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail, cargo ou setor"
            className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-16 text-sm text-ink placeholder:text-muted focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
          {search ? (
            <button
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-paper hover:text-ink"
            >
              <X size={15} />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-paper px-1.5 text-[11px] font-medium text-muted sm:block">
              /
            </kbd>
          )}
        </label>
        {!isRemovedView && (
          <div className="flex rounded-full border border-line bg-white p-1 text-xs font-semibold" role="group" aria-label="Ordenar">
            {(
              [
                { key: "name", label: "Nome", icon: ArrowDownAZ },
                { key: "recent", label: "Último acesso", icon: Clock },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                onClick={() => setSort(o.key)}
                aria-pressed={sort === o.key}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                  sort === o.key ? "bg-ink text-white" : "text-muted hover:text-ink"
                }`}
              >
                <o.icon size={13} aria-hidden="true" /> {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "no_modules" && counts.no_modules > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-warning-soft bg-warning-soft/60 px-4 py-3 text-sm text-warning-ink">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Estas pessoas estão ativas, mas não conseguem abrir nenhum módulo. Use “Acessos e permissões” para liberar.
        </p>
      )}
      {isRemovedView && (
        <p className="text-sm text-muted">
          Vínculos removidos deste órgão. A conta e o histórico foram preservados; restaure para devolver o acesso.
        </p>
      )}

      {error && (
        <p className="rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger-ink">{error}</p>
      )}

      {/* Lista */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        {/* Cabeçalho da tabela (desktop) */}
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_144px] gap-4 border-b border-line bg-paper px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted lg:grid">
          <span>Usuário</span>
          <span>Cargo e setor</span>
          <span>{isRemovedView ? "Removido em" : "Módulos"}</span>
          <span>{isRemovedView ? "" : "Último acesso"}</span>
          <span className="sr-only">Ações</span>
        </div>

        {loading ? (
          <ul aria-busy="true" aria-label="Carregando usuários">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-0">
                <span className="h-10 w-10 animate-pulse rounded-full bg-paper" />
                <span className="flex-1 space-y-2">
                  <span className="block h-3 w-40 animate-pulse rounded bg-paper" />
                  <span className="block h-3 w-56 animate-pulse rounded bg-paper" />
                </span>
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users size={20} />}
              title={
                isRemovedView
                  ? "Nenhum usuário removido"
                  : filtersActive
                    ? "Ninguém encontrado"
                    : "Nenhum usuário ainda"
              }
              description={
                isRemovedView
                  ? "Quem for removido do órgão aparece aqui e pode ser restaurado."
                  : filtersActive
                    ? "Tente outro termo ou volte para Todos."
                    : "Cadastre o primeiro servidor do órgão."
              }
              action={
                filtersActive && !isRemovedView ? (
                  <button
                    onClick={() => {
                      setSearch("");
                      setView("all");
                    }}
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
                  >
                    Limpar filtros
                  </button>
                ) : !isRemovedView ? (
                  <Link href="/usuarios/novo" className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white">
                    Novo usuário
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul>
            {visible.map((u) => (
              <UserRow
                key={u.membership_id}
                user={u}
                removedView={isRemovedView}
                onOpen={() => !isRemovedView && router.push(`/usuarios/${u.user_id}`)}
                onMenu={(el) => openMenu(u, el)}
                onRestore={() => setConfirm({ user: u, action: "restore" })}
                menuOpen={menu?.user.user_id === u.user_id}
              />
            ))}
          </ul>
        )}
      </div>

      {!loading && visible.length > 0 && (
        <p className="text-center text-xs text-muted">
          {visible.length === 1 ? "1 pessoa" : `${visible.length} pessoas`}
          {filtersActive && ` de ${isRemovedView ? counts.removed : counts.all}`}
        </p>
      )}

      {/* Menu de ações */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden="true" />
          <div
            role="menu"
            aria-label={`Ações para ${menu.user.name}`}
            className="fixed z-50 w-64 overflow-hidden rounded-2xl border border-line bg-white shadow-pop"
            style={{ top: menu.top, left: menu.left }}
          >
            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-sm font-semibold text-ink">{menu.user.name}</p>
              <p className="truncate text-xs text-muted">{menu.user.email}</p>
            </div>
            <div className="p-1.5">
              <MenuGroup label="Cadastro">
                <MenuLink href={`/usuarios/${menu.user.user_id}`} icon={Eye}>Ver detalhes</MenuLink>
                <MenuLink href={`/usuarios/${menu.user.user_id}/editar`} icon={Pencil}>Editar dados</MenuLink>
                <MenuLink href={`/usuarios/${menu.user.user_id}/acessos`} icon={UserCog}>Acessos e permissões</MenuLink>
                <MenuLink href={`/usuarios/${menu.user.user_id}/perfil`} icon={ShieldCheck}>
                  {menu.user.membership_role === "ORG_ADMIN" ? "Perfil no órgão" : "Tornar gestor"}
                </MenuLink>
              </MenuGroup>
              <MenuGroup label="Segurança">
                <MenuLink href={`/usuarios/${menu.user.user_id}/senha`} icon={KeyRound}>Definir nova senha</MenuLink>
                <MenuLink href={`/usuarios/${menu.user.user_id}/forcar-troca`} icon={RefreshCcw}>Exigir troca de senha</MenuLink>
                <MenuLink href={`/usuarios/${menu.user.user_id}/revogar-sessoes`} icon={LogOut}>Encerrar sessões</MenuLink>
              </MenuGroup>
              <div className="my-1 border-t border-line" />
              <MenuButton
                icon={menu.user.membership_active ? UserMinus : UserCheck}
                tone={menu.user.membership_active ? "warn" : "good"}
                onClick={() => {
                  setConfirm({ user: menu.user, action: "status" });
                  setMenu(null);
                }}
              >
                {menu.user.membership_active ? "Suspender" : "Reativar"}
              </MenuButton>
              <MenuButton
                icon={Trash2}
                tone="danger"
                onClick={() => {
                  setConfirm({ user: menu.user, action: "remove" });
                  setMenu(null);
                }}
              >
                Remover do órgão
              </MenuButton>
            </div>
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          open
          busy={busyAction}
          title={confirmCopy(confirm).title}
          message={confirmCopy(confirm).message}
          confirmLabel={confirmCopy(confirm).label}
          danger={confirmCopy(confirm).danger}
          onConfirm={() => runAction(confirm.user, confirm.action)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function UserRow({
  user: u,
  removedView,
  onOpen,
  onMenu,
  onRestore,
  menuOpen,
}: {
  user: TenantUserRow;
  removedView: boolean;
  onOpen: () => void;
  onMenu: (el: HTMLElement) => void;
  onRestore: () => void;
  menuOpen: boolean;
}) {
  const modules = u.modules ?? [];
  const isManager = u.membership_role === "ORG_ADMIN";
  const suspended = !u.membership_active;
  const role = [u.position, u.department].filter(Boolean).join(" · ");

  return (
    <li
      onClick={onOpen}
      className={`group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 transition last:border-0 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_144px] ${
        removedView ? "" : "cursor-pointer hover:bg-paper/70"
      } ${menuOpen ? "bg-paper/70" : ""}`}
    >
      {/* Pessoa */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative shrink-0">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${
              suspended || removedView ? "bg-paper text-muted" : avatarTone(u.user_id)
            }`}
            aria-hidden="true"
          >
            {initials(u.name)}
          </span>
          {!removedView && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${suspended ? "bg-warning" : "bg-accent"}`}
              title={suspended ? "Suspenso" : "Ativo"}
            />
          )}
        </span>
        <div className="min-w-0">
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {removedView ? (
              <span className="truncate text-sm font-semibold text-ink">{u.name}</span>
            ) : (
              <Link
                href={`/usuarios/${u.user_id}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-sm font-semibold text-ink hover:underline focus:outline-none focus-visible:underline"
              >
                {u.name}
              </Link>
            )}
            {isManager && <Badge tone="ink" icon={ShieldCheck}>Gestor</Badge>}
            {suspended && !removedView && <Badge tone="warn">Suspenso</Badge>}
            {u.locked && <Badge tone="danger" icon={Lock}>Bloqueado</Badge>}
            {u.must_change_password && !removedView && !suspended && (
              <Badge tone="muted" icon={KeyRound}>Troca de senha pendente</Badge>
            )}
          </p>
          <p className="truncate text-xs text-muted">{u.email}</p>
          {role && <p className="truncate text-xs text-muted lg:hidden">{role}</p>}
        </div>
      </div>

      {/* Ações (mobile: à direita da pessoa) */}
      <div className="flex items-center justify-end gap-1 lg:order-last">
        {removedView ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink/30"
          >
            <RotateCcw size={13} aria-hidden="true" /> Restaurar
          </button>
        ) : (
          <>
            <Link
              href={`/usuarios/${u.user_id}/acessos`}
              onClick={(e) => e.stopPropagation()}
              title="Acessos e permissões"
              aria-label={`Acessos e permissões de ${u.name}`}
              className="hidden h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-xs font-semibold text-ink transition hover:border-ink/30 hover:shadow-card lg:inline-flex"
            >
              <KeyRound size={13} aria-hidden="true" /> Acessos
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMenu(e.currentTarget);
              }}
              aria-label={`Mais ações para ${u.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-white hover:text-ink hover:shadow-card"
            >
              <MoreHorizontal size={17} />
            </button>
          </>
        )}
      </div>

      {/* Cargo e setor */}
      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-sm text-ink">{u.position || <span className="text-muted">—</span>}</p>
        {u.department && <p className="truncate text-xs text-muted">{u.department}</p>}
      </div>

      {/* Módulos / removido em */}
      <div className="col-span-2 min-w-0 pl-[52px] lg:col-span-1 lg:pl-0">
        {removedView ? (
          <span className="text-xs text-muted">{formatDateTime(u.removed_at)}</span>
        ) : modules.length === 0 ? (
          <span className={`inline-flex items-center gap-1 text-xs ${suspended ? "text-muted" : "font-medium text-warning-ink"}`}>
            {!suspended && <AlertTriangle size={12} aria-hidden="true" />} Nenhum módulo
          </span>
        ) : (
          <ModuleStack modules={modules} />
        )}
      </div>

      {/* Último acesso */}
      <div className="col-span-2 hidden min-w-0 lg:col-span-1 lg:block">
        {!removedView && (
          <span
            className={`text-xs ${u.last_login_at ? "text-ink" : "text-muted"}`}
            title={u.last_login_at ? formatDateTime(u.last_login_at) : undefined}
          >
            {u.last_login_at ? formatRelative(u.last_login_at) : "Nunca acessou"}
          </span>
        )}
      </div>
    </li>
  );
}

function ModuleStack({ modules }: { modules: UserModule[] }) {
  const shown = modules.slice(0, 4);
  const rest = modules.length - shown.length;
  const review = modules.some((m) => m.requires_review);
  return (
    <div className="flex items-center gap-2" title={modules.map((m) => m.name).join(", ")}>
      <div className="flex -space-x-1.5">
        {shown.map((m) => {
          const v = moduleVisual(m.slug);
          const Icon = v.icon as LucideIcon;
          return (
            <span
              key={m.slug}
              className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ring-2 ring-white ${v.gradient}`}
            >
              <Icon size={13} className="text-white" aria-hidden="true" />
            </span>
          );
        })}
        {rest > 0 && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper text-[10px] font-bold text-muted ring-2 ring-white">
            +{rest}
          </span>
        )}
      </div>
      <span className="truncate text-xs text-muted">
        {modules.length === 1 ? modules[0].name : `${modules.length} módulos`}
        {review && <span className="ml-1 font-semibold text-warning-ink">· revisar</span>}
      </span>
      <span className="sr-only">: {modules.map((m) => m.name).join(", ")}</span>
    </div>
  );
}

function Badge({
  children,
  tone,
  icon: Icon,
}: {
  children: ReactNode;
  tone: "ink" | "warn" | "danger" | "muted";
  icon?: LucideIcon;
}) {
  const tones = {
    ink: "bg-ink/5 text-ink ring-ink/10",
    warn: "bg-warning-soft text-warning-ink ring-warning-soft",
    danger: "bg-danger-soft text-danger-ink ring-danger-soft",
    muted: "bg-paper text-muted ring-line",
  };
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${tones[tone]}`}>
      {Icon && <Icon size={10} aria-hidden="true" />}
      {children}
    </span>
  );
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-0.5">
      <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      {children}
    </div>
  );
}

function MenuLink({ href, icon: Icon, children }: { href: string; icon: ElementType; children: ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink transition hover:bg-paper focus:bg-paper focus:outline-none"
    >
      <Icon size={15} className="text-muted" aria-hidden="true" />
      {children}
    </Link>
  );
}

function MenuButton({
  icon: Icon,
  tone,
  onClick,
  children,
}: {
  icon: ElementType;
  tone: "warn" | "good" | "danger";
  onClick: () => void;
  children: ReactNode;
}) {
  const tones = {
    warn: "text-warning-ink hover:bg-warning-soft/60",
    good: "text-accent-ink hover:bg-accent-soft/60",
    danger: "text-danger-ink hover:bg-danger-soft/70",
  };
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition focus:outline-none ${tones[tone]}`}
    >
      <Icon size={15} aria-hidden="true" />
      {children}
    </button>
  );
}
