"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, SAAS_URL } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import NotificationsPanel from "./NotificationsPanel";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  external?: boolean;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Publicação",
    items: [
      { label: "Visão geral", href: "/", icon: "space_dashboard" },
      { label: "Matérias", href: "/matters", icon: "description" },
      { label: "Edições", href: "/editions", icon: "auto_stories" },
      { label: "Documentos oficiais", href: "/documentos", icon: "badge" },
      { label: "Modelos documentais", href: "/documentos/modelos", icon: "dashboard_customize" },
      { label: "Importar", href: "/importar", icon: "upload_file" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { label: "Tipos de ato", href: "/tipos-ato", icon: "category", adminOnly: true },
      { label: "Autoridades", href: "/autoridades", icon: "account_balance", adminOnly: true },
      { label: "Usuários", href: "/users", icon: "group" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Operações", href: "/operacoes", icon: "settings_suggest" },
      { label: "Configurações", href: "/settings", icon: "tune", adminOnly: true },
      { label: "Identidade institucional", href: "/settings/institution", icon: "apartment", adminOnly: true },
      { label: "Inteligência artificial", href: "/settings/ai", icon: "smart_toy", adminOnly: true },
      { label: "Certificados", href: "/settings/certificates", icon: "verified_user", adminOnly: true },
      { label: "Verificar PDF", href: "/verify", icon: "picture_as_pdf" },
    ],
  },
];

const PLATFORM_GROUP: NavGroup = {
  label: "Administração da plataforma",
  items: [
    { label: "Organizações", href: "/admin/organizacoes", icon: "business" },
    { label: "Planos", href: "/admin/planos", icon: "card_membership" },
    { label: "Usuários globais", href: "/admin/usuarios", icon: "supervisor_account" },
  ],
};

const ALL_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...PLATFORM_GROUP.items,
  { label: "Voltar ao SaaS", href: SAAS_URL, icon: "arrow_back", external: true },
];

function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** A rota mais específica ganha o destaque (ex.: /settings/institution vs /settings). */
function resolveActiveLabel(pathname: string): string {
  const match = ALL_ITEMS.filter((i) => !i.external && isActiveHref(pathname, i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? "Painel administrativo";
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, switchOrganization } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [orgs, setOrgs] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [orgSelectorOpen, setOrgSelectorOpen] = useState(false);

  const isSuperAdmin = user?.roles.some((r) => r.name === "SUPER_ADMIN") ?? false;
  const isAdmin = (user?.roles.some((r) => r.name === "ADMIN") ?? false) || isSuperAdmin;

  const activeLabel = useMemo(() => resolveActiveLabel(pathname), [pathname]);

  useEffect(() => {
    api.listOrganizations().then(setOrgs).catch((err) => notifyError("AdminShell.listOrganizations", err));
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      window.location.replace(SAAS_URL);
    }
  }, [loading, user]);

  useEffect(() => {
    setSidebarOpen(false);
    setOrgSelectorOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  const groups: NavGroup[] = isSuperAdmin ? [...NAV_GROUPS, PLATFORM_GROUP] : NAV_GROUPS;
  const currentOrg = orgs.find((o) => o.id === user.organization_id)?.name;

  return (
    <div className="min-h-screen bg-background text-on-background font-body-md overflow-x-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-primary shadow-xl transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Marca */}
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/95 shadow-sm">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h16v2H4v-2zm0 4h10v2H4v-2z" fill="#0B2440" />
            </svg>
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body-sm font-bold tracking-tight text-on-primary">
              Diário Oficial
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-primary/50">
              Painel administrativo
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
            className="ml-auto text-on-primary/60 hover:text-on-primary lg:hidden"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Navegação */}
        <nav className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Navegação principal">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-primary/40">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  if (item.adminOnly && !isAdmin) return null;
                  if (item.superAdminOnly && !isSuperAdmin) return null;
                  const active = isActiveHref(pathname, item.href);
                  const className = `group relative flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                    active
                      ? "bg-white/10 text-on-primary"
                      : "text-on-primary/70 hover:bg-white/[0.06] hover:text-on-primary"
                  }`;

                  return (
                    <li key={item.href}>
                      {item.external ? (
                        <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
                          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{item.icon}</span>
                          <span className="truncate text-body-sm font-medium">{item.label}</span>
                        </a>
                      ) : (
                        <Link href={item.href} className={className} aria-current={active ? "page" : undefined}>
                          {active && (
                            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white" aria-hidden="true" />
                          )}
                          <span className={`material-symbols-outlined text-[20px] ${active ? "text-on-primary" : "text-on-primary/60 group-hover:text-on-primary"}`} aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="truncate text-body-sm font-medium">{item.label}</span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Rodapé do menu: identidade + organização + sair */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-body-sm font-bold text-on-primary">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-sm font-semibold text-on-primary">{user.name}</span>
              <span className="truncate text-[11px] text-on-primary/50">{user.email}</span>
            </div>
          </div>

          {orgs.length > 1 && (
            <div className="relative mt-1">
              <button
                onClick={() => setOrgSelectorOpen(!orgSelectorOpen)}
                aria-expanded={orgSelectorOpen}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-body-sm text-on-primary/70 transition-colors hover:bg-white/[0.06] hover:text-on-primary"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">business</span>
                <span className="flex-1 truncate text-left">{currentOrg || "Organização"}</span>
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">expand_more</span>
              </button>
              {orgSelectorOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-white/10 bg-primary-container shadow-pop">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => {
                        switchOrganization(org.id);
                        setOrgSelectorOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-body-sm transition-colors ${
                        org.id === user.organization_id
                          ? "bg-white/10 font-semibold text-on-primary"
                          : "text-on-primary/70 hover:bg-white/[0.06] hover:text-on-primary"
                      }`}
                    >
                      {org.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {logoutConfirm ? (
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={logout}
                className="flex-1 rounded-lg bg-error py-2 text-body-sm font-semibold text-on-error transition-opacity hover:opacity-90"
              >
                Sair
              </button>
              <button
                onClick={() => setLogoutConfirm(false)}
                className="flex-1 rounded-lg py-2 text-body-sm font-medium text-on-primary/60 transition-colors hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setLogoutConfirm(true)}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-body-sm text-on-primary/60 transition-colors hover:bg-white/[0.06] hover:text-on-primary"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
              Encerrar sessão
            </button>
          )}
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex h-screen flex-col overflow-hidden lg:ml-64">
        <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="text-primary lg:hidden"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="flex min-w-0 flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                Diário Oficial Eletrônico
              </span>
              <h1 className="truncate text-body-md font-semibold text-on-surface">{activeLabel}</h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-on-surface-variant">Sistema operacional</span>
            </span>
            <NotificationsPanel />
            <a
              href="mailto:contato@govsistem.com.br?subject=Suporte%20DOE%20Admin"
              className="hidden h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high sm:flex"
              aria-label="Suporte"
              title="Suporte"
            >
              <span className="material-symbols-outlined" aria-hidden="true">help</span>
            </a>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>

        <footer className="flex flex-col items-center justify-between gap-2 border-t border-outline-variant bg-surface px-4 py-3 sm:flex-row sm:px-6 lg:px-8">
          <span className="text-body-sm text-on-surface-variant">
            © {new Date().getFullYear()} Diário Oficial Eletrônico
          </span>
          <div className="flex gap-5">
            <a className="text-body-sm text-on-surface-variant transition-colors hover:text-primary" href="#">
              Termos de uso
            </a>
            <a className="text-body-sm text-on-surface-variant transition-colors hover:text-primary" href="#">
              Privacidade
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
