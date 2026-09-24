"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  HelpCircle,
  ClipboardList,
  ScrollText,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import { useSidebar } from "@/components/sidebar-context";
import clsx from "clsx";

export function Sidebar() {
  const { ctx } = useAuth();
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();

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
    <>
      {/* Fundo escurecido no mobile */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={clsx(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        id="menu-lateral"
        className={clsx(
          "fixed left-0 top-0 z-50 flex h-[100dvh] w-64 max-w-[85vw] flex-col overflow-y-auto px-4 py-6",
          "transition-transform duration-200 ease-out lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ backgroundColor: "#002b54" }}
      >
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Building2 size={20} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold leading-none text-white">
              {ctx?.organization.name?.split(" ")[0] ?? "GovSistem"}
            </h1>
            <p className="mt-1 text-xs text-white/60">Portal do Órgão</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="-mr-1 rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon size={18} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/ajuda"
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive("/ajuda") ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
            )}
          >
            <HelpCircle size={18} className="shrink-0" /> Ajuda e suporte
          </Link>
        </nav>
      </aside>
    </>
  );
}
