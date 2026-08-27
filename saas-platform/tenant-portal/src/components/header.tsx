"use client";
import { useAuth } from "@/lib/auth-provider";
import { Check, ChevronDown, LogOut, User, KeyRound, Building2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function Header() {
  const { ctx, organizations, switchTenant, logout } = useAuth();
  const user = ctx?.user;
  const org = ctx?.organization;
  const [orgOpen, setOrgOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const orgRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const multiTenant = organizations.length > 1;

  return (
    <header
      className="fixed right-0 top-0 left-0 z-30 flex h-14 items-center justify-between border-b border-outline-variant bg-surface px-6"
      style={{ left: "16rem" }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
        {multiTenant && (
          <div className="relative" ref={orgRef}>
            <button
              onClick={() => setOrgOpen((o) => !o)}
              className="flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-container"
            >
              <span className="max-w-40 truncate">{org?.name}</span>
              <ChevronDown size={14} className="text-on-surface-variant" />
            </button>
            {orgOpen && (
              <div className="absolute left-0 z-20 mt-2 w-64 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg">
                <p className="border-b px-3 py-2 text-xs font-medium uppercase text-on-surface-variant">
                  Trocar organização
                </p>
                <ul className="max-h-64 overflow-auto py-1">
                  {organizations.map((o) => {
                    const active = o.id === ctx?.organization.id;
                    return (
                      <li key={o.id}>
                        <button
                          onClick={async () => {
                            setOrgOpen(false);
                            if (!active) await switchTenant(o.id);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-container"
                        >
                          <span className="truncate">{o.name}</span>
                          {active && <Check size={15} className="text-primary-700" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
        {!multiTenant && (
          <span className="truncate text-lg font-bold text-on-surface">{org?.name}</span>
        )}
        <span className="hidden rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 sm:inline-block">
          {user?.profile === "ORG_ADMIN" ? "Gestor" : "Usuário"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-3 transition hover:bg-surface-container"
            title="Meu perfil"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#001631" }}>
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
            <span className="hidden flex-col items-start leading-tight md:flex">
              <span className="max-w-[140px] truncate text-sm font-bold text-on-surface">{user?.name}</span>
              <span className="max-w-[140px] truncate text-[11px] text-on-surface-variant">{user?.email}</span>
            </span>
            <ChevronDown size={16} className="text-on-surface-variant" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg text-base font-bold text-white" style={{ backgroundColor: "#001631" }}>
                    {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-on-surface">{user?.name}</p>
                    <p className="truncate text-xs text-on-surface-variant">{user?.email}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
                  <div className="rounded-lg bg-surface-container-low px-2 py-1.5">
                    <p className="text-[10px] uppercase text-on-surface-variant">Perfil</p>
                    <p className="font-semibold text-on-surface">
                      {user?.profile === "ORG_ADMIN" ? "Gestor" : "Usuário"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-container-low px-2 py-1.5">
                    <p className="text-[10px] uppercase text-on-surface-variant">Órgão</p>
                    <p className="break-words whitespace-normal font-semibold leading-snug text-on-surface">{org?.name}</p>
                  </div>
                </div>
              </div>
              <div className="p-2">
                <Link
                  href="/perfil"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container"
                >
                  <User size={16} className="text-on-surface-variant" /> Meu perfil
                </Link>
                <Link
                  href="/seguranca"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container"
                >
                  <KeyRound size={16} className="text-on-surface-variant" /> Segurança
                </Link>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut size={16} /> Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
