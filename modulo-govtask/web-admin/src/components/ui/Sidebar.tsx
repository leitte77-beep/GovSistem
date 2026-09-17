"use client";

import Link from "next/link";
import {
  FileStack,
  Settings,
  LogOut,
  ChevronDown,
  ChevronUp,
  Landmark,
  X,
  Menu,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import {
  PERM,
  PERFIL_LABEL,
  navGroupsDoPerfil,
  perfilDoUsuario,
  type NavItem,
} from "@/lib/perfil";

type SidebarUser = {
  name: string;
  email: string;
  roles: { name: string }[];
  permissions?: string[];
};

const ADMIN_ITEMS: NavItem[] = [
  { key: "templates", href: "/admin/templates", label: "Templates", icon: FileStack },
  { key: "configuracoes", href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

const SAAS_URL = process.env.NEXT_PUBLIC_SAAS_URL || "http://localhost:3000";

type SidebarProps = {
  user: SidebarUser | null;
  pathname: string;
  onLogout: () => void;
  open?: boolean;
  onClose?: (open?: boolean) => void;
};

export function Sidebar({ user, pathname, onLogout, open, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const perms = useMemo(() => user?.permissions ?? [], [user]);
  const perfil = useMemo(() => perfilDoUsuario(perms), [perms]);
  const navGroups = useMemo(() => navGroupsDoPerfil(perfil, perms), [perfil, perms]);

  const isAdmin = perms.includes(PERM.ADMIN);
  const initials = user?.name
    ? user.name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase()
    : "GT";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const linkClass = (href: string) =>
    cn(
      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
      collapsed && "justify-center px-2",
      isActive(href)
        ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        : "text-navy-muted hover:bg-white/5 hover:text-white"
    );

  const renderNavItem = (item: NavItem) => (
    <Link key={item.key} href={item.href} className={linkClass(item.href)} title={collapsed ? item.label : undefined} onClick={() => onClose?.(false)}>
      {isActive(item.href) && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-gradient-to-b from-[#60A5FA] to-[#A78BFA]" />
      )}
      <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive(item.href) ? 2.4 : 2} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-navy text-white rounded-lg shadow-lg"
        onClick={() => onClose?.(!open)}
        aria-label="Abrir menu"
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
          onClick={() => onClose?.()}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 h-screen bg-[#0E1B2E] text-white flex flex-col transition-all duration-200 border-r border-white/5",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        {/* Marca */}
        <div className={cn("flex items-center gap-3 px-4 h-[72px] border-b border-white/5", collapsed && "justify-center px-2")}>
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg shadow-[#2563EB]/30 shrink-0">
            <Landmark className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[15px] font-bold tracking-tight">GovTask</h1>
                <Sparkles className="w-3.5 h-3.5 text-[#A78BFA]" />
              </div>
              <p className="text-[11px] text-navy-muted truncate">Gestão de Recursos Públicos</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn("ml-auto p-1.5 rounded-lg text-navy-muted hover:text-white hover:bg-white/5 transition-colors hidden lg:block", collapsed && "ml-0")}
            aria-label="Recolher menu"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {/* Navegação agrupada */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto scrollbar-thin">
          {navGroups.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-navy-muted uppercase tracking-[0.12em]">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(renderNavItem)}
              </div>
            </div>
          ))}

          {isAdmin && (
            <div className={cn(collapsed && "pt-2 border-t border-white/5")}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-navy-muted uppercase tracking-[0.12em] pt-3">
                  Sistema
                </p>
              )}
              <div className="space-y-0.5">
                {ADMIN_ITEMS.map(renderNavItem)}
                {!collapsed && (
                  <a
                    href={SAAS_URL}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-navy-muted hover:bg-white/5 hover:text-white transition-all"
                  >
                    <FileStack className="w-[18px] h-[18px] shrink-0" />
                    <span>Admin SaaS</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </nav>

        {/* Usuário */}
        <div className="p-3 border-t border-white/5">
          {user ? (
            <div className={cn("rounded-xl bg-white/5 p-2.5", collapsed && "flex justify-center p-2")}>
              {!collapsed && (
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center text-[13px] font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-navy-muted truncate">{PERFIL_LABEL[perfil]}</p>
                  </div>
                </div>
              )}
              <button
                onClick={onLogout}
                className={cn(
                  "flex items-center gap-2 w-full rounded-lg text-[13px] text-navy-muted hover:bg-white/10 hover:text-white transition-colors",
                  collapsed ? "justify-center p-2" : "px-3 py-2"
                )}
                title={collapsed ? "Sair" : undefined}
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Sair</span>}
              </button>
            </div>
          ) : (
            !collapsed && <p className="px-3 py-2 text-meta text-navy-muted">Não autenticado</p>
          )}
        </div>
      </aside>
    </>
  );
}
