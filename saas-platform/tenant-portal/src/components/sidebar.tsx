"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
  HelpCircle,
  ClipboardList,
  ScrollText,
} from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import clsx from "clsx";

export function Sidebar() {
  const { ctx } = useAuth();
  const pathname = usePathname();

  const isManager = ctx?.user.is_manager;

  const managerItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/usuarios", label: "Usuários", icon: Users },
    { href: "/acessos", label: "Acessos e permissões", icon: ClipboardList },
    { href: "/modulos-contratados", label: "Módulos contratados", icon: Building2 },
    { href: "/auditoria", label: "Auditoria", icon: ScrollText },
    { href: "/dados-do-orgao", label: "Dados do órgão", icon: Building2 },
  ];

  const userItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ];

  const items = isManager ? managerItems : userItems;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col px-4 py-6"
      style={{ backgroundColor: "#002b54" }}
    >
      <div className="mb-10 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
          <Building2 size={20} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-none text-white">
            {ctx?.organization.name?.split(" ")[0] ?? "GovSistem"}
          </h1>
          <p className="mt-1 text-xs text-white/60">Portal do Órgão</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/ajuda"
          className={clsx(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isActive("/ajuda") ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
          )}
        >
          <HelpCircle size={18} /> Ajuda e suporte
        </Link>
      </nav>
    </aside>
  );
}
