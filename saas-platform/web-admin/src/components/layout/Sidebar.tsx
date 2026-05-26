"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  module?: string;
  adminOnly?: boolean;
}

const allNavItems: NavItem[] = [
  { href: "/", icon: "dashboard", label: "Dashboard" },
  { href: "/orgaos", icon: "corporate_fare", label: "Organizações", adminOnly: true },
  { href: "/usuarios", icon: "group", label: "Usuários", adminOnly: true },
  { href: "/planos", icon: "payments", label: "Planos", adminOnly: true },
  { href: "/modulos", icon: "extension", label: "Módulos", adminOnly: true },
  { href: "/assinaturas", icon: "receipt_long", label: "Assinaturas", adminOnly: true },
  { href: "/financeiro", icon: "account_balance_wallet", label: "Financeiro", module: "financeiro" },
  { href: "/contabilidade", icon: "account_tree", label: "Contabilidade", module: "financeiro" },
  { href: "/configuracoes", icon: "settings", label: "Configurações", adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const canAccess = (item: NavItem): boolean => {
    if (!user) return false;
    if (user.is_platform_admin) return true;
    if (item.adminOnly) return false;
    if (item.module) {
      const perms = user.module_permissions || [];
      return perms.includes(item.module);
    }
    return true;
  };

  const visibleItems = allNavItems.filter(canAccess);

  return (
    <aside
      className="flex flex-col h-screen fixed left-0 top-0 z-40 px-4 py-6"
      style={{ width: "var(--sidebar-width)", backgroundColor: "#002b54" }}
    >
      <div className="mb-10 px-2 flex items-center gap-3">
        <div className="w-10 h-10 bg-white/10 flex items-center justify-center rounded-lg">
          <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance</span>
        </div>
        <div>
          <h1 className="text-headline-md font-bold text-white">GovSistem</h1>
          <p className="text-label-md text-white/60">Admin Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {visibleItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="material-symbols-outlined text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 border-t border-white/10">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-white truncate">{user?.name || "Admin"}</p>
            <p className="text-xs text-white/50 truncate">{user?.email || ""}</p>
            {user?.is_organization_admin && <p className="text-xs text-green-300">Admin do Orgão</p>}
          </div>
        </div>
      </div>
    </aside>
  );
}
