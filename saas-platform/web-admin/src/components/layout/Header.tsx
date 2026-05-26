"use client";
import React from "react";
import { useAuth } from "@/lib/auth-provider";

export default function Header({ title }: { title: string }) {
  const { logout } = useAuth();

  return (
    <header
      className="fixed top-0 right-0 bg-surface border-b border-outline-variant flex items-center justify-between px-gutter z-30"
      style={{ left: "var(--sidebar-width)", height: "var(--header-height)" }}
    >
      <div className="flex items-center gap-6 flex-1">
        <span className="text-headline-sm font-bold text-[#001631]">{title}</span>
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
          <input
            className="w-full bg-surface-container-low border-none rounded-full py-2 pl-10 pr-4 text-body-sm focus:ring-2 focus:ring-[#001631]/20 focus:bg-white transition-all outline-none"
            placeholder="Pesquisar módulos ou ferramentas..."
            type="text"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-[#001631] rounded-full transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <div className="h-8 w-px bg-outline-variant mx-2" />
        <button onClick={logout} className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-surface-container transition-all">
          <span className="text-body-sm font-bold text-[#001631]">Sair</span>
          <span className="material-symbols-outlined text-[#001631]">logout</span>
        </button>
      </div>
    </header>
  );
}
