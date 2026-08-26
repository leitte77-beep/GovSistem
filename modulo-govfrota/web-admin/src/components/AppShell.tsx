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
      <div className="flex h-screen items-center justify-center bg-surface-bg">
        <div className="animate-pulse text-body text-text-subtle">Carregando GovFrota…</div>
      </div>
    );
  }

  if (!user) return null;

  const itensVisiveis = NAV_ITEMS.filter((item) => hasPermission(item.perm));

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-btn bg-[#1D4ED8] text-white">
          <Truck size={20} />
        </div>
        <div>
          <div className="text-label font-semibold text-text-title">GovFrota</div>
          <div className="text-meta text-text-subtle">Gestão de Frota</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {itensVisiveis.map((item) => {
          const ativo =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icone = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuAberto(false)}
              className={`flex items-center gap-3 rounded-btn px-3 py-2 text-body-sm transition-colors ${
                ativo
                  ? "bg-[#EFF6FF] font-medium text-[#1D4ED8]"
                  : "text-text-body hover:bg-surface-bg"
              }`}
            >
              <Icone size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen bg-surface-bg">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-surface-border bg-white md:flex">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenuAberto(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-elevated">
            <button className="self-end p-3" onClick={() => setMenuAberto(false)}>
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-surface-border bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setMenuAberto(true)}>
              <Menu size={22} />
            </button>
            <span className="text-h3 text-text-title">GovFrota</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-body-sm text-text-body sm:inline">{user.name}</span>
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="btn btn-ghost btn-sm"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
