"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type TopbarProps = {
  user: { id: string; name: string; email: string; roles?: { name: string }[] } | null;
  onMenuClick?: () => void;
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  ASSESSOR: "Assessor",
  ENGENHEIRO_TECNICO: "Engenharia",
  COMPRAS_LICITACAO: "Licitações",
  GESTOR: "Gestão",
};

function roleLabel(roles?: { name: string }[]): string | null {
  if (!roles) return null;
  for (const r of roles) {
    if (ROLE_LABEL[r.name]) return ROLE_LABEL[r.name];
  }
  return null;
}

export function Topbar({ user, onMenuClick }: TopbarProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const loadUnread = () => {
      api.listNotificacoes({ nao_lidas: true })
        .then((n) => setUnreadCount(n.length))
        .catch(() => {});
    };
    loadUnread();
    const interval = setInterval(loadUnread, 60000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    router.push(`/busca?q=${encodeURIComponent(search.trim())}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("govtask_access_token");
    localStorage.removeItem("govtask_refresh_token");
    window.dispatchEvent(new Event("auth:logout"));
  };

  if (!user) return null;

  return (
    <header className="h-18 bg-surface-card/80 backdrop-blur border-b border-surface-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-text-subtle hover:text-text-body transition-colors mr-2"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle transition-colors group-focus-within:text-[#2563EB]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar processos, convênios ou tarefas..."
            className="w-full rounded-full border border-surface-border bg-white pl-10 pr-4 py-2.5 text-body-sm text-[#101828] placeholder:text-[#98A2B3] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]/40 transition-all"
          />
        </div>
      </form>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/notificacoes"
          className="relative p-2.5 rounded-full text-text-subtle hover:bg-[#F6F7F9] hover:text-[#2563EB] transition-colors"
          aria-label="Notificações"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-br from-[#B42318] to-[#912018] text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 py-1.5 pl-1.5 pr-2.5 rounded-full hover:bg-[#F6F7F9] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white text-label font-semibold shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-label text-text-title font-medium">{user.name.split(" ")[0]}</span>
              {roleLabel(user.roles) && (
                <span className="text-[11px] text-[#2563EB] font-medium">{roleLabel(user.roles)}</span>
              )}
            </span>
            <ChevronDown className="w-4 h-4 text-text-subtle" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-surface-card border border-surface-border rounded-card shadow-elevated z-50 py-1.5">
              <div className="px-4 py-3 border-b border-surface-border">
                <p className="text-label text-text-title">{user.name}</p>
                <p className="text-meta text-text-subtle mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-body-sm text-text-body hover:bg-[#F6F7F9] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
