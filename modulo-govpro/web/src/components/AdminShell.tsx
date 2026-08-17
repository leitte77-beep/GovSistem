"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SAAS_URL } from "@/lib/api";
import { initials } from "@/lib/format";
import QuickSearch from "@/components/QuickSearch";

const NAV_ITEMS: { label: string; href: string; icon: string; roles?: string[] }[] = [
  { label: "Dashboard", href: "/", icon: "dashboard" },
  { label: "Busca", href: "/busca", icon: "search" },
  { label: "Minha Caixa", href: "/caixa", icon: "inbox" },
  { label: "Processos", href: "/processos", icon: "folder_open" },
  { label: "Autuar", href: "/processos/novo", icon: "add_circle" },
  { label: "Blocos de assinatura", href: "/blocos-assinatura", icon: "draw" },
  { label: "Prazos", href: "/prazos", icon: "schedule" },
  { label: "Feriados", href: "/feriados", icon: "calendar_month" },
  { label: "Arquivo", href: "/arquivo", icon: "archive", roles: ["ARQUIVISTA", "ADMIN"] },
  {
    label: "Cidadãos pendentes",
    href: "/cidadaos",
    icon: "person_check",
    roles: ["PROTOCOLO", "ADMIN"],
  },
  { label: "Ouvidoria", href: "/manifestacoes", icon: "campaign" },
  {
    label: "Auditoria",
    href: "/auditoria",
    icon: "fact_check",
    roles: ["AUDITOR", "ADMIN"],
  },
];

const ADMIN_NAV_ITEMS: { label: string; href: string; icon: string }[] = [
  { label: "Tipos de processo", href: "/admin/tipos-processo", icon: "category" },
  { label: "Tipos de documento", href: "/admin/tipos-documento", icon: "description" },
  { label: "Matriz de assinaturas", href: "/admin/matriz-assinaturas", icon: "border_color" },
  { label: "Unidades", href: "/admin/unidades", icon: "account_tree" },
  { label: "Hipóteses legais", href: "/admin/hipoteses-legais", icon: "gavel" },
  { label: "Plano de classificação", href: "/admin/classificacao", icon: "sort" },
  { label: "Motivos de sobrestamento", href: "/admin/motivos-sobrestamento", icon: "pause_circle" },
  { label: "Indisponibilidades", href: "/admin/indisponibilidades", icon: "cloud_off" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Bom dia");
    else if (h < 18) setGreeting("Boa tarde");
    else setGreeting("Boa noite");
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      window.location.replace(SAAS_URL);
    }
  }, [loading, user]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  const canSee = (roles?: string[]) =>
    !roles || roles.some((r) => user.roles.includes(r));

  return (
    <div className="min-h-screen bg-background text-on-background font-body-md overflow-x-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className="flex flex-col fixed left-0 top-0 h-full bg-primary shadow-lg w-64 z-50 transition-transform duration-200 lg:translate-x-0"
        style={sidebarOpen ? { transform: "translateX(0)" } : {}}
      >
        <div className="px-6 py-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-1.5 shadow-md flex-shrink-0">
            <span className="material-symbols-outlined text-primary text-[24px]" aria-hidden="true">
              account_balance
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-headline-sm font-headline-sm font-bold text-on-primary truncate">
              GovPro
            </h1>
            <span className="text-[10px] uppercase tracking-widest text-on-primary/60 font-semibold">
              Processo Eletrônico
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden text-on-primary/60 hover:text-on-primary ml-auto"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex-1 mt-4 space-y-1 overflow-y-auto px-3" aria-label="Navegação principal">
          {NAV_ITEMS.filter((item) => canSee(item.roles)).map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-4 py-3 gap-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? "bg-on-primary-fixed-variant text-on-primary"
                    : "text-on-primary/70 hover:text-on-primary hover:bg-on-primary-fixed-variant/50"
                }`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                <span className="text-label-md font-label-md">{item.label}</span>
              </Link>
            );
          })}

          {user.roles.includes("ADMIN") && (
            <div className="pt-4 mt-4 border-t border-on-primary/10">
              <span className="px-4 text-[10px] uppercase tracking-widest text-on-primary/50 font-semibold">
                Administração
              </span>
              <div className="mt-2 space-y-1">
                {ADMIN_NAV_ITEMS.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center px-4 py-3 gap-3 rounded-lg transition-all duration-200 ${
                        isActive
                          ? "bg-on-primary-fixed-variant text-on-primary"
                          : "text-on-primary/70 hover:text-on-primary hover:bg-on-primary-fixed-variant/50"
                      }`}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                      <span className="text-label-md font-label-md">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <a
            href={SAAS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center px-4 py-3 gap-3 rounded-lg text-on-primary/70 hover:text-on-primary hover:bg-on-primary-fixed-variant/50 transition-all mt-2"
          >
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
            <span className="text-label-md font-label-md">Voltar ao SaaS</span>
          </a>
        </nav>

        {/* User section */}
        <div className="mt-auto p-4 border-t border-on-primary/10">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-on-primary/5">
            <div className="w-10 h-10 rounded-full bg-primary-container border-2 border-on-primary/20 flex items-center justify-center font-bold text-on-primary flex-shrink-0">
              {initials(user.name)}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-label-md text-on-primary truncate">{user.name}</span>
              <span className="text-[10px] text-on-primary/60 truncate">{user.email}</span>
            </div>
          </div>

          {logoutConfirm ? (
            <div className="mt-2 flex gap-1">
              <button
                onClick={logout}
                className="flex-1 py-1.5 text-xs font-medium bg-error text-on-error rounded-lg hover:opacity-90 transition-all"
              >
                Confirmar
              </button>
              <button
                onClick={() => setLogoutConfirm(false)}
                className="flex-1 py-1.5 text-xs font-medium text-on-primary/60 hover:bg-on-primary/5 rounded-lg transition-all"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setLogoutConfirm(true)}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2 text-on-primary/70 hover:text-on-primary transition-colors"
            >
              <span className="material-symbols-outlined" aria-hidden="true">logout</span>
              <span className="text-label-md">Sair</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        <header className="flex justify-between items-center gap-4 px-gutter w-full h-16 bg-surface border-b border-outline-variant sticky top-0 z-40">
          <div className="flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="lg:hidden text-primary"
            >
              <span className="material-symbols-outlined" aria-hidden="true">menu</span>
            </button>
            <h2 className="text-body-md text-primary font-medium italic hidden md:block whitespace-nowrap">
              {greeting}, {user?.name || "Servidor"}
            </h2>
          </div>
          <QuickSearch />
          <div className="hidden sm:flex items-center gap-2 bg-secondary-container/20 px-3 py-1 rounded-full text-secondary flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-label-md text-[11px] uppercase tracking-wider">Sistema Online</span>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="flex justify-between items-center px-gutter py-4 w-full bg-surface-container-lowest border-t border-outline-variant">
          <span className="text-body-sm text-on-surface-variant">
            © {new Date().getFullYear()} GovPro · Processo Administrativo Eletrônico
          </span>
          <span className="text-body-sm text-on-surface-variant">Lei 9.784/1999 · LAI</span>
        </footer>
      </div>
    </div>
  );
}
