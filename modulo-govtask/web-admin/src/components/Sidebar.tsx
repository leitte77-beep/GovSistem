"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Bell,
  Settings,
  FileStack,
  ExternalLink,
  LogOut,
  X,
  Menu,
} from "lucide-react";
import { useState } from "react";

const SAAS_URL = process.env.NEXT_PUBLIC_SAAS_URL || "http://localhost:3000";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/convenios", label: "Convênios", icon: FileText },
  { href: "/tarefas", label: "Minhas Tarefas", icon: CheckSquare },
  { href: "/notificacoes", label: "Notificações", icon: Bell },
];

const adminItems = [
  { href: "/admin/templates", label: "Templates", icon: FileStack },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasRole } = useAuth();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive(href)
        ? "bg-primary-600 text-white"
        : "text-gray-300 hover:bg-gray-700 hover:text-white"
    }`;

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-lg"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky inset-y-0 left-0 top-0 z-40 h-screen w-64 shrink-0 bg-gray-900 text-white flex flex-col transform transition-transform ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">GovTask</h1>
          <p className="text-xs text-gray-400">Gestão de Convênios</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(item.href)}
              onClick={() => setOpen(false)}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}

          {hasRole("ADMIN") && (
            <>
              <div className="pt-3 pb-1 px-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Administração
                </p>
              </div>
              {adminItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={linkClass(item.href)}
                  onClick={() => setOpen(false)}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              ))}
              <a
                href={SAAS_URL}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                <ExternalLink size={18} />
                Admin SaaS
              </a>
            </>
          )}
        </nav>

        <div className="p-3 border-t border-gray-700">
          <div className="px-3 py-2 text-sm text-gray-400">
            <p className="font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 w-full text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors mt-1"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
