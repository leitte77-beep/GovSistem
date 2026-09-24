"use client";
import React, { useState } from "react";
import { useAuth } from "@/lib/auth-provider";
import ProfileModal from "./ProfileModal";

export default function Header({ title, onMenuClick }: { title: string; onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header
      className="fixed top-0 right-0 left-0 lg:left-[var(--sidebar-width)] bg-surface border-b border-outline-variant flex items-center justify-between px-gutter z-30"
      style={{ height: "var(--header-height)" }}
    >
      <div className="flex items-center gap-3 sm:gap-6 flex-1 min-w-0">
        {/* Abrir menu lateral (só no celular/tablet) */}
        <button
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="lg:hidden text-[#001631] flex items-center shrink-0"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <span className="text-headline-sm font-bold text-[#001631] truncate">{title}</span>
        <div className="relative w-full max-w-md hidden sm:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
          <input
            className="w-full bg-surface-container-low border-none rounded-full py-2 pl-10 pr-4 text-body-sm focus:ring-2 focus:ring-[#001631]/20 focus:bg-white transition-all outline-none"
            placeholder="Pesquisar módulos ou ferramentas..."
            type="text"
          />
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <button className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-[#001631] rounded-full transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>

        {/* User menu trigger */}
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full hover:bg-surface-container transition-all"
          title="Meu perfil"
        >
          <span className="w-8 h-8 rounded-lg bg-[#001631] flex items-center justify-center text-white font-bold text-sm shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </span>
          <span className="hidden md:flex flex-col items-start leading-tight">
            <span className="text-body-sm font-bold text-[#001631] max-w-[140px] truncate">{user?.name || "Admin"}</span>
            <span className="text-[11px] text-on-surface-variant max-w-[140px] truncate">{user?.email || ""}</span>
          </span>
          <span className="material-symbols-outlined text-on-surface-variant text-lg">expand_more</span>
        </button>

        <div className="h-8 w-px bg-outline-variant mx-1 hidden sm:block" />
        <button onClick={logout} aria-label="Sair" className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full hover:bg-surface-container transition-all">
          <span className="text-body-sm font-bold text-[#001631] hidden sm:inline">Sair</span>
          <span className="material-symbols-outlined text-[#001631]">logout</span>
        </button>
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}
