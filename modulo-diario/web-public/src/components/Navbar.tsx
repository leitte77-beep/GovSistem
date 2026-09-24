"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useOrg } from "@/lib/org-context";
import AccessibilityPanel from "./AccessibilityPanel";

const NAV_LINKS = [
  { href: "/edicoes", label: "Edições", icon: "newspaper", description: "Publicações oficiais" },
  { href: "/buscar", label: "Pesquisa", icon: "manage_search", description: "Encontre atos e matérias" },
  { href: "/verificar", label: "Autenticidade", icon: "verified_user", description: "Valide um documento" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { org } = useOrg();
  const siteName = org?.name || "Diário Oficial";
  const logoSrc = org?.logo_url || null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const adminUrl = `${process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.govsistem.com.br"}/login`;

  useEffect(() => setMobileOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-[0_4px_24px_rgba(15,42,82,0.06)] backdrop-blur-xl"
      style={org ? { "--tw-text-primary": org.theme.primary_color } as React.CSSProperties : undefined}
    >
      <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-8 xl:gap-12">
          <Link href="/" className="flex min-w-0 items-center gap-3 text-base font-extrabold tracking-tight text-brand-900 sm:text-lg">
            {logoSrc ? (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-inset ring-brand-100">
                <Image src={logoSrc} alt={siteName} width={32} height={32} className="h-8 w-auto" />
              </span>
            ) : <span aria-hidden="true" className="h-7 w-1 rounded-full bg-gradient-to-b from-brand-accent to-emerald-500" />}
            <span className="max-w-[210px] truncate lg:max-w-[270px]">{siteName}</span>
          </Link>
          <nav className="hidden items-center gap-1 rounded-2xl bg-slate-100/80 p-1.5 ring-1 ring-inset ring-slate-200/70 lg:flex" aria-label="Navegação principal">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-bold transition-all duration-200 ${
                    active
                      ? "bg-white text-brand-900 shadow-[0_3px_12px_rgba(15,42,82,.10)] ring-1 ring-inset ring-slate-200"
                      : "text-slate-500 hover:bg-white/70 hover:text-brand-900"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${active ? "text-brand-accent" : "text-slate-400 group-hover:text-brand-accent"}`}>{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={adminUrl}
            className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-brand-900 shadow-sm transition hover:border-brand-100 hover:bg-brand-50 sm:flex"
          >
            <span className="material-symbols-outlined text-[20px]">account_circle</span>
            <span>Área administrativa</span>
          </a>
          <AccessibilityPanel />
          <Link
            href="/contato"
            className="hidden h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-900 sm:flex"
            aria-label="Ajuda"
            title="Ajuda e contato"
          >
            <span className="material-symbols-outlined text-[21px]">help</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900 text-white shadow-sm lg:hidden"
          >
            <span className="material-symbols-outlined text-[22px]">{mobileOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-navigation" className="absolute inset-x-0 top-20 border-t border-slate-100 bg-white p-4 shadow-[0_18px_38px_rgba(15,42,82,.14)] lg:hidden">
          <nav className="mx-auto grid max-w-[720px] gap-2" aria-label="Navegação móvel">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href);
              return (
                <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl border p-3.5 transition ${active ? "border-brand-100 bg-brand-50" : "border-transparent hover:bg-slate-50"}`}>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-white text-brand-accent shadow-sm" : "bg-slate-100 text-slate-500"}`}><span className="material-symbols-outlined text-[20px]">{link.icon}</span></span>
                  <span><span className="block text-sm font-bold text-brand-900">{link.label}</span><span className="mt-0.5 block text-xs text-slate-500">{link.description}</span></span>
                </Link>
              );
            })}
            <a href={adminUrl} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 py-3 text-sm font-bold text-white">
              <span className="material-symbols-outlined text-[19px]">account_circle</span> Área administrativa
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
