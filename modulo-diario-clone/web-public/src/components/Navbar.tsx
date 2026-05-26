"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg } from "@/lib/org-context";
import AccessibilityPanel from "./AccessibilityPanel";

const NAV_LINKS = [
  { href: "/edicoes", label: "Edições" },
  { href: "/buscar", label: "Pesquisa Avançada" },
  { href: "/verificar", label: "Verificar Assinatura" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { org } = useOrg();
  const siteName = org?.name || "Diário Oficial";
  const logoSrc = org?.logo_url || null;

  return (
    <header
      className="bg-surface border-b border-outline-variant shadow-sm h-20 flex items-center sticky top-0 z-50"
      style={org ? { "--tw-text-primary": org.theme.primary_color } as React.CSSProperties : undefined}
    >
      <div className="flex justify-between items-center w-full px-gutter max-w-container-max mx-auto h-20">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-headline-sm font-headline-sm font-bold text-primary flex items-center gap-2">
            {logoSrc ? (
              <img src={logoSrc} alt={siteName} className="h-8 w-auto" />
            ) : null}
            {siteName}
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href || (link.href === "/" && pathname === "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-label-md font-label-md pb-1 transition-colors duration-200 ${
                    isActive
                      ? "text-primary font-bold active-nav-border"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={`${process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:9202"}/login`}
            className="flex items-center gap-2 px-4 py-2 text-label-md font-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200 rounded-lg"
          >
            <span className="material-symbols-outlined">account_circle</span>
            <span>Entrar</span>
          </a>
          <AccessibilityPanel />
          <button
            className="p-2 text-on-surface-variant hover:bg-surface-container-low transition-colors duration-200 rounded-full"
            aria-label="Ajuda"
          >
            <span className="material-symbols-outlined">help</span>
          </button>
        </div>
      </div>
    </header>
  );
}
