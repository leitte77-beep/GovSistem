"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useCitizen } from "@/lib/citizen";

const SUBNAV = [
  { label: "Meus processos", href: "/painel", icon: "folder_open" },
  { label: "Intimações", href: "/painel/intimacoes", icon: "notifications" },
  { label: "Peticionar", href: "/painel/peticionar", icon: "edit_document" },
];

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCitizen();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-gutter py-16 text-center text-on-surface-variant">
        Carregando…
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-gutter py-10">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-primary-container flex items-center justify-center font-bold text-on-primary">
          {(user.nome || "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-headline-sm font-headline-sm">{user.nome}</div>
          <div className="text-body-sm text-on-surface-variant">{user.email}</div>
        </div>
      </div>

      <nav className="mt-6 flex gap-1 border-b border-outline-variant overflow-x-auto" aria-label="Área do cidadão">
        {SUBNAV.map((item) => {
          const active = item.href === "/painel" ? pathname === "/painel" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-2 px-4 py-3 text-label-md font-label-md whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  );
}
