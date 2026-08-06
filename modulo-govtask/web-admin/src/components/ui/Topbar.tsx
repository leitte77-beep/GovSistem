"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type TopbarProps = {
  user: { id: string; name: string; email: string } | null;
  onMenuClick?: () => void;
};

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
    router.push(`/convenios?search=${encodeURIComponent(search.trim())}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("govtask_access_token");
    localStorage.removeItem("govtask_refresh_token");
    window.dispatchEvent(new Event("auth:logout"));
  };

  if (!user) return null;

  return (
    <header className="h-18 bg-surface-card border-b border-surface-border flex items-center justify-between px-6">
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-text-subtle hover:text-text-body transition-colors mr-3"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar convênios ou tarefas..."
            className="input pl-10 py-2 text-body-sm"
          />
        </div>
      </form>

      <div className="flex items-center gap-3">
        <Link
          href="/notificacoes"
          className="relative p-2 rounded-btn text-text-subtle hover:bg-surface-bg hover:text-text-body transition-colors"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#B42318] text-white text-meta font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 py-1.5 px-2 rounded-btn hover:bg-surface-bg transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#1D4ED8] flex items-center justify-center text-white text-label font-medium">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-label text-text-title hidden sm:block">{user.name.split(" ")[0]}</span>
            <ChevronDown className="w-4 h-4 text-text-subtle" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-surface-card border border-surface-border rounded-card shadow-elevated z-50 py-1">
              <div className="px-4 py-3 border-b border-surface-border">
                <p className="text-label text-text-title">{user.name}</p>
                <p className="text-meta text-text-subtle mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-body-sm text-text-body hover:bg-surface-bg transition-colors"
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
