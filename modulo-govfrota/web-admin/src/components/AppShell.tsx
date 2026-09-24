"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Truck,
  Users,
  Fuel,
  Wrench,
  AlertTriangle,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  Bell,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "vehicle.view" },
  { href: "/veiculos", label: "Veículos", icon: Truck, perm: "vehicle.view" },
  { href: "/motoristas", label: "Motoristas", icon: Users, perm: "driver.manage" },
  { href: "/abastecimentos", label: "Abastecimentos", icon: Fuel, perm: "refueling.view" },
  { href: "/tanques", label: "Combustíveis", icon: Fuel, perm: "refueling.view" },
  { href: "/manutencoes", label: "Manutenções", icon: Wrench, perm: "maintenance.view" },
  { href: "/ocorrencias", label: "Ocorrências", icon: AlertTriangle, perm: "vehicle.view" },
  { href: "/oficinas", label: "Oficinas", icon: Building2, perm: "maintenance.view" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, perm: "reports.view" },
  { href: "/busca", label: "Pesquisa", icon: Search, perm: "vehicle.view" },
  { href: "/notificacoes", label: "Alertas", icon: Bell, perm: "vehicle.view" },
  { href: "/auditoria", label: "Auditoria", icon: ShieldCheck, perm: "audit.view" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, perm: "config.manage" },
];

const PAPEIS: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR_FROTA: "Gestor de frota",
  RESP_COMBUSTIVEL: "Responsável por combustível",
  RESP_MANUTENCAO: "Responsável por manutenção",
  CONSULTA: "Consulta",
  AUDITOR: "Auditor",
};

const NAV_CLASSE = {
  ativo: "flex items-center gap-3 px-3 py-2.5 bg-[#1D5BD6] text-white rounded-md font-medium text-sm",
  inativo:
    "flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-md font-medium text-sm transition-colors",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, hasPermission } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      window.location.href = "/login";
    }
  }, [loading, user, pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F9FF]">
        <div className="animate-pulse text-body text-[#737781]">Carregando GovFrota…</div>
      </div>
    );
  }

  if (!user) return null;

  const itensVisiveis = NAV_ITEMS.filter((item) => hasPermission(item.perm));
  const primeiroPapel = user.roles?.[0];
  const papel = primeiroPapel ? PAPEIS[primeiroPapel.name] || primeiroPapel.label || null : null;

  const SidebarContent = () => (
    <>
      <div className="flex h-16 items-center border-b border-white/10 px-6 py-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#1D5BD6] text-white">
            <Truck size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-none text-[#4ADE80]">GovFrota</h1>
            <p className="mt-1 text-xs text-gray-400">Gestão de Frotas</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {itensVisiveis.map((item) => {
          const ativo =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icone = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuAberto(false)}
              className={ativo ? NAV_CLASSE.ativo : NAV_CLASSE.inativo}
            >
              <Icone size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-white/10 p-4">
        <span className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400">
          <HelpCircle size={18} /> Suporte
        </span>
        <button
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <LogOut size={18} /> Sair
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FF]">
      {/* Sidebar desktop */}
      <aside className="flex h-full w-64 flex-shrink-0 flex-col bg-[#151E2F] text-white transition-all duration-300">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenuAberto(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-[#151E2F] text-white shadow-elevated">
            <button className="self-end p-3 text-gray-400" onClick={() => setMenuAberto(false)} aria-label="Fechar menu">
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#C3C6D1]/30 bg-white px-8">
          <div className="flex items-center gap-3">
            <button className="text-[#424750] md:hidden" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
              <Menu size={22} />
            </button>
            <span className="text-lg font-bold text-[#1D5BD6]">GovFrota</span>
          </div>
          <div className="flex items-center gap-4 text-[#424750]">
            <button className="rounded-full p-2 transition-colors hover:bg-[#EFF4FF]" aria-label="Alertas">
              <Bell size={20} />
            </button>
            <div className="ml-2 flex items-center gap-3 border-l border-[#C3C6D1]/30 pl-4">
              <span className="text-sm font-medium text-[#181C22]">{user.name || user.email}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E3ECFF] text-[#424750]">
                <Users size={20} />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
