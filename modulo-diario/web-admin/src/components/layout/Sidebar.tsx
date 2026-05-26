"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Tag,
  Building2,
  PenTool,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Matérias", href: "/materias", icon: FileText },
  { label: "Edições", href: "/edicoes", icon: BookOpen },
  { label: "Tipos de Ato", href: "/tipos-ato", icon: Tag },
  { label: "Unidades", href: "/unidades", icon: Building2 },
  { label: "Assinaturas", href: "/assinaturas", icon: PenTool },
  { label: "Credenciais", href: "/credenciais", icon: Shield },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary-500" />
            <span className="text-sm font-bold text-white">Diário Oficial</span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto">
            <BookOpen className="h-6 w-6 text-primary-500" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="rounded-lg p-1 text-gray-400 hover:bg-sidebar-hover hover:text-white"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-white"
                  : "text-gray-400 hover:bg-sidebar-hover hover:text-white",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-700 px-4 py-3">
        {!collapsed && (
          <p className="text-xs text-gray-500">Módulo Diário Oficial v1.0</p>
        )}
      </div>
    </aside>
  );
}
