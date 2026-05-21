"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import NotificationsPanel from "./NotificationsPanel";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "dashboard" },
  { label: "Matérias", href: "/matters", icon: "description" },
  { label: "Edições", href: "/editions", icon: "auto_stories" },
  { label: "Importar", href: "/importar", icon: "upload_file" },
  { label: "Operações", href: "/operacoes", icon: "settings_suggest" },
  { label: "Usuários", href: "/users", icon: "group" },
  { label: "Certificados", href: "/settings/certificates", icon: "verified_user" },
  { label: "Verificar PDF", href: "/verify", icon: "picture_as_pdf" },
  { label: "Configurações", href: "/settings", icon: "settings" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
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
      router.push("/login");
    }
  }, [loading, user, router]);

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

  return (
    <div className="min-h-screen bg-background text-on-background font-body-md overflow-x-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className="flex flex-col fixed left-0 top-0 h-full bg-primary shadow-lg w-64 z-50 transition-transform duration-200 lg:translate-x-0"
        style={sidebarOpen ? { transform: "translateX(0)" } : {}}
      >
        {/* Logo */}
        <div className="px-6 py-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-1.5 shadow-md flex-shrink-0">
            <svg className="w-full h-full" viewBox="0 0 24 24" fill="none">
              <path d="M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h16v2H4v-2zm0 4h10v2H4v-2z" fill="#001631" />
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <h1 className="text-headline-sm font-headline-sm font-bold text-on-primary truncate">
              Diário Oficial
            </h1>
            <span className="text-[10px] uppercase tracking-widest text-on-primary/60 font-semibold">
              Painel Administrativo
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

        {/* Nav */}
        <nav className="flex-1 mt-4 space-y-1 overflow-y-auto px-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
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
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="text-label-md font-label-md">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="mt-auto p-4 border-t border-on-primary/10">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-on-primary/5">
            <div className="w-10 h-10 rounded-full bg-primary-container border-2 border-on-primary/20 flex items-center justify-center font-bold text-on-primary flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-label-md text-on-primary truncate">
                {user.name}
              </span>
              <span className="text-[10px] text-on-primary/60 truncate">
                {user.email}
              </span>
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
              <span className="material-symbols-outlined">logout</span>
              <span className="text-label-md">Sair</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="flex justify-between items-center px-gutter w-full h-16 bg-surface border-b border-outline-variant sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="lg:hidden text-primary"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="material-symbols-outlined text-primary-fixed-dim">
              waving_hand
            </span>
            <h2 className="text-body-md text-primary font-medium italic">
              {greeting}, bem-vindo ao DOE Admin
            </h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-secondary-container/20 px-3 py-1 rounded-full text-secondary">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-label-md text-[11px] uppercase tracking-wider">
                Sistema Online
              </span>
            </div>
            <div className="flex items-center gap-3 text-on-surface-variant">
              <NotificationsPanel />
              <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">help</span>
              </button>
              <span className="h-6 w-px bg-outline-variant" />
              <button className="text-label-md text-primary hover:underline">
                Suporte
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>

        {/* Footer */}
        <footer className="flex justify-between items-center px-gutter py-4 w-full bg-surface-container-lowest border-t border-outline-variant">
          <span className="text-body-sm text-on-surface-variant">
            © 2026 Diário Oficial. Todos os direitos reservados.
          </span>
          <div className="flex gap-6">
            <a className="text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              Termos de Uso
            </a>
            <a className="text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              Privacidade
            </a>
            <a className="text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">
              Ajuda
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
