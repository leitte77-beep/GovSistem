"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getOrgNome } from "@/lib/org";
import { useCitizen } from "@/lib/citizen";

const NAV = [
  { label: "Início", href: "/", icon: "home" },
  { label: "Consultar processo", href: "/consulta", icon: "search" },
  { label: "Validar documento", href: "/validar", icon: "verified" },
  { label: "Ouvidoria", href: "/ouvidoria", icon: "campaign" },
];

export default function PublicHeader() {
  const pathname = usePathname();
  const { user, logout } = useCitizen();
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOrgNome(getOrgNome());
    const onChanged = () => setOrgNome(getOrgNome());
    window.addEventListener("org:changed", onChanged);
    return () => window.removeEventListener("org:changed", onChanged);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="bg-primary text-on-primary sticky top-0 z-40 shadow-md">
      <div className="max-w-container-max mx-auto px-gutter">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-on-primary/90 text-[28px]" aria-hidden="true">
              account_balance
            </span>
            <div className="min-w-0">
              <div className="text-headline-sm font-headline-sm font-bold leading-tight truncate">
                Processo Eletrônico
              </div>
              <div className="text-[11px] text-on-primary/70 truncate">
                {orgNome || "Portal do cidadão"}
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Navegação principal">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-label-md font-label-md transition-colors ${
                    active ? "bg-on-primary-fixed-variant text-on-primary" : "text-on-primary/75 hover:text-on-primary hover:bg-on-primary-fixed-variant/40"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                <Link
                  href="/painel"
                  className="px-3 py-2 rounded-lg text-label-md font-label-md text-on-primary/75 hover:text-on-primary hover:bg-on-primary-fixed-variant/40 transition-colors"
                >
                  Meus processos
                </Link>
                <button
                  onClick={logout}
                  className="px-3 py-2 rounded-lg text-label-md font-label-md text-on-primary/75 hover:text-on-primary hover:bg-on-primary-fixed-variant/40 transition-colors"
                >
                  Sair
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 h-10 px-4 bg-on-primary text-primary rounded-lg font-label-md hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">login</span>
                Entrar
              </Link>
            )}
          </div>

          <button
            className="md:hidden text-on-primary"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
          >
            <span className="material-symbols-outlined">{open ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-on-primary/10 px-gutter py-2" aria-label="Menu móvel">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-2 py-3 text-label-md text-on-primary/90 hover:bg-on-primary-fixed-variant/30 rounded-lg"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <div className="border-t border-on-primary/10 mt-2 pt-2">
            {user ? (
              <>
                <Link href="/painel" className="flex items-center gap-3 px-2 py-3 text-label-md text-on-primary/90">
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">folder_open</span>
                  Meus processos
                </Link>
                <button onClick={logout} className="w-full flex items-center gap-3 px-2 py-3 text-label-md text-on-primary/90">
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>
                  Sair
                </button>
              </>
            ) : (
              <Link href="/login" className="flex items-center gap-3 px-2 py-3 text-label-md text-on-primary/90">
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">login</span>
                Entrar
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
