"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import {
  KeyRound,
  ShieldCheck,
  UserCog,
  Users,
  Plus,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
  RefreshCcw,
  LogOut,
  Search,
  UserCheck,
  AlertTriangle,
  MoreVertical,
  ChevronDown,
} from "lucide-react";
import api from "@/lib/api";
import Link from "next/link";
import ConfirmDialog from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/format";

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
}

type Action = "status" | "manager" | "reset" | "remove" | "restore" | "force_reset" | "revoke";

export default function UsersPage() {
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProfile, setFilterProfile] = useState<string>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ user: TenantUserRow; action: Action } | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ per_page: "200" });
      if (search) params.set("search", search);
      const r = await api<{ data: TenantUserRow[] }>(`/tenant/users?${params.toString()}`);
      setUsers(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao listar usuários");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openMenu]);

  const stats = useMemo(() => {
    const active = users.filter((u) => u.membership_active).length;
    const suspended = users.length - active;
    const managers = users.filter((u) => u.membership_role === "ORG_ADMIN").length;
    return { total: users.length, active, suspended, managers };
  }, [users]);

  const runAction = async (user: TenantUserRow, action: Action) => {
    setBusyAction(true);
    setError("");
    try {
      switch (action) {
        case "status": {
          const updated = await api<{ is_active: boolean }>(`/tenant/users/${user.user_id}/status`, {
            method: "PATCH",
            body: { is_active: !user.membership_active },
          });
          setUsers((prev) => prev.map((x) => (x.user_id === user.user_id ? { ...x, membership_active: updated.is_active } : x)));
          toast(updated.is_active ? "success" : "info", updated.is_active ? "Usuário ativado." : "Usuário suspenso.");
          break;
        }
        case "manager": {
          const makeManager = user.membership_role !== "ORG_ADMIN";
          await api(`/tenant/users/${user.user_id}/status`, {
            method: "PATCH",
            body: { membership_role: makeManager ? "ORG_ADMIN" : "ORG_MEMBER" },
          });
          setUsers((prev) => prev.map((x) => (x.user_id === user.user_id ? { ...x, membership_role: makeManager ? "ORG_ADMIN" : "ORG_MEMBER" } : x)));
          toast("success", makeManager ? "Usuário promovido a gestor." : "Usuário rebaixado para membro.");
          break;
        }
        case "reset":
          await api(`/tenant/users/${user.user_id}/password-reset`, { method: "POST" });
          toast("info", "Redefinição iniciada. O usuário trocará a senha no próximo acesso.");
          break;
        case "force_reset":
          await api(`/tenant/users/${user.user_id}/force-password-reset`, { method: "POST" });
          toast("success", "Troca de senha obrigatória no próximo acesso.");
          break;
        case "revoke":
          await api(`/tenant/users/${user.user_id}/revoke-sessions`, { method: "POST" });
          toast("success", "Sessões do usuário revogadas.");
          break;
        case "remove":
          await api(`/tenant/users/${user.user_id}`, { method: "DELETE" });
          setUsers((prev) => prev.filter((x) => x.user_id !== user.user_id));
          toast("success", "Usuário removido deste órgão.");
          break;
        case "restore": {
          await api(`/tenant/users/${user.user_id}/restore`, { method: "POST" });
          await load();
          toast("success", "Usuário restaurado no órgão.");
          break;
        }
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

  const filtered = users.filter((u) => {
    if (filterStatus !== "all" && String(u.membership_active) !== filterStatus) return false;
    if (filterProfile !== "all" && u.membership_role !== filterProfile) return false;
    return true;
  });

  const confirmCopy = (action: Action) => {
    if (action === "remove")
      return {
        title: "Remover do órgão",
        message: `Remover ${confirm?.user.name} deste órgão? A identidade e o histórico serão preservados; os acessos deste órgão serão revogados.`,
        label: "Remover",
        danger: true,
      };
    if (action === "restore")
      return {
        title: "Restaurar vínculo",
        message: `Restaurar o vínculo de ${confirm?.user.name} com este órgão?`,
        label: "Restaurar",
        danger: false,
      };
    if (action === "manager")
      return {
        title: confirm?.user.membership_role !== "ORG_ADMIN" ? "Promover a gestor" : "Rebaixar para usuário",
        message: `Confirmar ${confirm?.user.membership_role !== "ORG_ADMIN" ? "a promoção" : "o rebaixamento"} de ${confirm?.user.name}?`,
        label: confirm?.user.membership_role !== "ORG_ADMIN" ? "Promover" : "Rebaixar",
        danger: confirm?.user.membership_role === "ORG_ADMIN",
      };
    if (action === "status")
      return {
        title: confirm?.user.membership_active ? "Suspender usuário" : "Ativar usuário",
        message: confirm?.user.membership_active
          ? `Suspender ${confirm?.user.name}? O acesso aos módulos deste órgão será bloqueado.`
          : `Ativar ${confirm?.user.name} novamente?`,
        label: confirm?.user.membership_active ? "Suspender" : "Ativar",
        danger: confirm?.user.membership_active,
      };
    return { title: "Confirmar", message: "Confirmar esta ação?", label: "Confirmar", danger: false };
  };

  const initials = (name?: string) =>
    name?.trim().split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

  const avatarColor = (u: TenantUserRow) =>
    u.membership_active ? "bg-primary-50 text-primary-700" : "bg-surface-container text-on-surface-variant";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Usuários do Órgão</h1>
          <p className="text-sm text-on-surface-variant">
            Gerencie os servidores, gestores, módulos e perfis de acesso da organização.
          </p>
        </div>
        <Link
          href="/usuarios/novo"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          <Plus size={16} /> Novo usuário
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: Users, color: "bg-blue-50 text-blue-600 ring-blue-100" },
          { label: "Ativos", value: stats.active, icon: UserCheck, color: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
          { label: "Suspensos", value: stats.suspended, icon: AlertTriangle, color: "bg-red-50 text-red-600 ring-red-100" },
          { label: "Gestores", value: stats.managers, icon: ShieldCheck, color: "bg-violet-50 text-violet-600 ring-violet-100" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border bg-surface-container-lowest p-4 shadow-sm">
              <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${s.color}`}>
                <Icon size={17} />
              </div>
              <p className="text-2xl font-bold leading-none text-on-surface">{s.value}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-surface-container-lowest p-3 shadow-sm">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            aria-label="Buscar usuário"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filtrar por status"
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm outline-none focus:border-primary-600"
        >
          <option value="all">Status: todos</option>
          <option value="true">Ativos</option>
          <option value="false">Suspensos</option>
        </select>
        <select
          value={filterProfile}
          onChange={(e) => setFilterProfile(e.target.value)}
          aria-label="Filtrar por perfil"
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm outline-none focus:border-primary-600"
        >
          <option value="all">Perfil: todos</option>
          <option value="ORG_ADMIN">Gestor</option>
          <option value="ORG_MEMBER">Usuário</option>
        </select>
        {(search || filterStatus !== "all" || filterProfile !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setFilterStatus("all");
              setFilterProfile("all");
            }}
            className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-low"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border bg-surface-container-lowest shadow-sm">
        <table className="min-w-full divide-y text-sm">
          <thead className="bg-surface-container-low text-left text-xs uppercase text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Cargo / Setor</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((u) => (
              <tr key={u.user_id} className={`transition hover:bg-surface-container-low ${u.membership_active ? "" : "opacity-60"}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${avatarColor(u)}`}>
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-on-surface">{u.name}</p>
                      <p className="truncate text-xs text-on-surface-variant">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">
                  {u.position ?? "—"}
                  {u.department ? <span className="text-xs"> · {u.department}</span> : null}
                </td>
                <td className="px-4 py-3">
                  {u.membership_role === "ORG_ADMIN" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                      <ShieldCheck size={12} /> Gestor
                    </span>
                  ) : (
                    <span className="text-xs text-on-surface-variant">Usuário</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.membership_active
                        ? "rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                        : "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600"
                    }
                  >
                    {u.membership_active ? "Ativo" : "Suspenso"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="relative flex justify-end">
                    {openMenu === u.user_id && (
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                    )}
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuPos({
                          top: rect.bottom + 4,
                          left: Math.max(rect.right - 240, 8),
                        });
                        setOpenMenu(openMenu === u.user_id ? null : u.user_id);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant transition hover:bg-surface-container-low hover:text-on-surface"
                      aria-label="Ações do usuário"
                      title="Ações"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenu === u.user_id && menuPos && (
                      <div
                        className="fixed z-50 w-60 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg"
                        style={{ top: menuPos.top, left: menuPos.left }}
                      >
                        <div className="border-b px-3 py-2 text-xs font-semibold text-on-surface-variant">
                          {u.name}
                        </div>
                        <div className="p-1.5">
                          <MenuLink href={`/usuarios/${u.user_id}`} icon={Eye}>Ver detalhes</MenuLink>
                          <MenuLink href={`/usuarios/${u.user_id}/editar`} icon={Pencil}>Editar dados</MenuLink>
                          <MenuLink href={`/usuarios/${u.user_id}/acessos`} icon={UserCog}>Acessos e permissões</MenuLink>
                          <MenuLink href={`/usuarios/${u.user_id}/perfil`} icon={ShieldCheck}>
                            {u.membership_role === "ORG_ADMIN" ? "Perfil no órgão" : "Promover a gestor"}
                          </MenuLink>
                          <div className="my-1 border-t border-outline-variant/60" />
                          <MenuLink href={`/usuarios/${u.user_id}/senha`} icon={KeyRound}>Redefinir senha</MenuLink>
                          <MenuLink href={`/usuarios/${u.user_id}/forcar-troca`} icon={RefreshCcw}>Forçar troca de senha</MenuLink>
                          <MenuLink href={`/usuarios/${u.user_id}/revogar-sessoes`} icon={LogOut}>Revogar sessões</MenuLink>
                          <div className="my-1 border-t border-outline-variant/60" />
                          <button
                            onClick={() => {
                              setOpenMenu(null);
                              setConfirm({ user: u, action: "status" });
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                          >
                            {u.membership_active ? "Suspender vínculo" : "Ativar vínculo"}
                          </button>
                          {!u.membership_active && (
                            <button
                              onClick={() => {
                                setOpenMenu(null);
                                setConfirm({ user: u, action: "restore" });
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-green-700 transition hover:bg-green-50"
                            >
                              Restaurar vínculo
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setOpenMenu(null);
                              setConfirm({ user: u, action: "remove" });
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 size={15} className="text-red-600" /> Remover do órgão
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  <Users size={24} className="mx-auto mb-2 opacity-40" />
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  <RefreshCcw size={18} className="mx-auto mb-2 animate-spin opacity-40" />
                  Carregando usuários...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          busy={busyAction}
          title={confirmCopy(confirm.action).title}
          message={confirmCopy(confirm.action).message}
          confirmLabel={confirmCopy(confirm.action).label}
          danger={confirmCopy(confirm.action).danger}
          onConfirm={() => runAction(confirm.user, confirm.action)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}


function MenuLink({ href, icon: Icon, children, danger }: { href: string; icon: ElementType; children: ReactNode; danger?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
        danger ? "text-red-600 hover:bg-red-50" : "text-on-surface hover:bg-surface-container-low"
      }`}
    >
      <Icon size={15} className={danger ? "text-red-600" : "text-on-surface-variant"} />
      {children}
    </Link>
  );
}
