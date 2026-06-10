"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Bell,
  FileStack,
  Settings,
  LogOut,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { X, Menu } from "lucide-react";

type SidebarUser = {
  name: string;
  email: string;
  roles: { name: string }[];
};

type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { key: "convenios", href: "/convenios", label: "Convênios", icon: FileText },
  { key: "tarefas", href: "/tarefas", label: "Minhas Tarefas", icon: CheckSquare },
  { key: "notificacoes", href: "/notificacoes", label: "Notificações", icon: Bell },
];

const ADMIN_ITEMS: NavItem[] = [
  { key: "templates", href: "/admin/templates", label: "Templates", icon: FileStack },
  { key: "configuracoes", href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

const SAAS_URL = process.env.NEXT_PUBLIC_SAAS_URL || "http://localhost:3000";

function AdminSaasLink() {
  return (
    <a
      href={SAAS_URL}
      className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-body-sm text-navy-muted hover:bg-navy-light hover:text-white transition-all duration-150"
    >
      <ExternalLinkIcon className="w-5 h-5 shrink-0" />
      Admin SaaS
    </a>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

type SidebarProps = {
  user: SidebarUser | null;
  pathname: string;
  onLogout: () => void;
  open?: boolean;
  onClose?: (open?: boolean) => void;
};

export function Sidebar({ user, pathname, onLogout, open, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin = user?.roles?.some(
    (r) => r.name === "ADMIN"
  );

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const linkClass = (href: string) =>
    cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-btn text-body-sm transition-all duration-150",
      collapsed && "justify-center px-2",
      isActive(href)
        ? "bg-navy-light text-white border-l-[3px] border-[#1D4ED8] pl-[9px]"
        : "text-navy-muted hover:bg-navy-light hover:text-white",
      collapsed && isActive(href) && "border-l-0 pl-2"
    );

  const renderNavItem = (item: NavItem) => (
    <Link key={item.key} href={item.href} className={linkClass(item.href)} title={collapsed ? item.label : undefined} onClick={() => onClose?.(false)}>
      <item.icon className="w-5 h-5 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-navy text-white rounded-btn"
        onClick={() => onClose?.(!open)}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => onClose?.()}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 h-screen bg-navy text-white flex flex-col transition-all duration-200",
          collapsed ? "w-16" : "w-64",
          open !== undefined
            ? open
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
            : ""
        )}
      >
        <div className="p-4 border-b border-navy-light flex items-center justify-between">
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold tracking-tight">GovTask</h1>
              <p className="text-meta text-navy-muted">Gestão de Convênios</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-btn text-navy-muted hover:text-white hover:bg-navy-light transition-colors hidden lg:block"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
          {NAV_ITEMS.map(renderNavItem)}

          {isAdmin && (
            <>
              {!collapsed && (
                <div className="pt-4 pb-1 px-3">
                  <p className="text-meta font-semibold text-navy-muted uppercase tracking-wider">
                    Administração
                  </p>
                </div>
              )}
              <div className={cn(collapsed && "pt-4 border-t border-navy-light")}>
                {ADMIN_ITEMS.map(renderNavItem)}
                {!collapsed && <AdminSaasLink />}
              </div>
            </>
          )}
        </nav>

        <div className="p-3 border-t border-navy-light">
          {user ? (
            <>
              {!collapsed && (
                <div className="px-3 py-2">
                  <p className="text-body-sm font-medium text-white truncate">{user.name}</p>
                  <p className="text-meta text-navy-muted truncate">{user.email}</p>
                </div>
              )}
              <button
                onClick={onLogout}
                className={cn(
                  "flex items-center gap-2 w-full rounded-btn text-body-sm text-navy-muted hover:bg-navy-light hover:text-white transition-colors mt-1",
                  collapsed ? "justify-center p-2" : "px-3 py-2"
                )}
                title={collapsed ? "Sair" : undefined}
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Sair</span>}
              </button>
            </>
          ) : (
            !collapsed && (
              <div className="px-3 py-2 text-meta text-navy-muted">Não autenticado</div>
            )
          )}
        </div>
      </aside>
    </>
  );
}
