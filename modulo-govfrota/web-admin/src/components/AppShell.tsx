"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  Bell,
  ShieldCheck,
  HelpCircle,
  Landmark,
  Route,
  Receipt,
  CheckCheck,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, AlertaAtual, NotificacaoItem } from "@/lib/api";

// `todas`: telas com dados da organização inteira — ocultas para quem só vê
// as próprias secretarias (o backend também as bloqueia).
// `grupo`: título da seção na lateral. `inclui`: telas que vivem dentro do item
// (SIM-AM em Relatórios, Auditoria em Configurações) e o mantêm destacado.
const NAV_ITEMS: {
  href: string; label: string; icon: typeof Truck; perm: string; todas?: boolean; grupo?: string; inclui?: string[];
}[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "vehicle.view" },
  { href: "/minha-secretaria", label: "Minha Secretaria", icon: Landmark, perm: "refueling.view" },
  { href: "/veiculos", label: "Veículos", icon: Truck, perm: "vehicle.view", grupo: "Operação" },
  { href: "/motoristas", label: "Motoristas", icon: Users, perm: "driver.manage", todas: true, grupo: "Operação" },
  { href: "/usos", label: "Diário de Bordo", icon: Route, perm: "vehicle.view", grupo: "Operação" },
  { href: "/abastecimentos", label: "Abastecimentos", icon: Fuel, perm: "refueling.view", grupo: "Operação" },
  { href: "/manutencoes", label: "Manutenções", icon: Wrench, perm: "maintenance.view", grupo: "Operação" },
  { href: "/ocorrencias", label: "Ocorrências", icon: AlertTriangle, perm: "vehicle.view", grupo: "Operação" },
  { href: "/notas-fiscais", label: "Faturamento", icon: Receipt, perm: "refueling.view", grupo: "Financeiro" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, perm: "reports.view", grupo: "Financeiro", inclui: ["/simam"] },
  { href: "/fornecedores", label: "Fornecedores", icon: Building2, perm: "vehicle.view", todas: true, grupo: "Cadastros" },
  { href: "/tanques", label: "Combustíveis", icon: Fuel, perm: "refueling.view", todas: true, grupo: "Cadastros" },
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
  const { user, loading, logout, hasPermission, restrito } = useAuth();
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

  const itensVisiveis = NAV_ITEMS.filter((item) => hasPermission(item.perm) && !(restrito && item.todas));
  const primeiroPapel = user.perfis?.[0] ?? user.roles?.[0];
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
        {itensVisiveis.map((item, i) => {
          const ativo =
            item.href === "/"
              ? pathname === "/"
              : [item.href, ...(item.inclui ?? [])].some((h) => pathname.startsWith(h));
          const Icone = item.icon;
          const novoGrupo = item.grupo && item.grupo !== itensVisiveis[i - 1]?.grupo;
          return (
            <div key={item.href}>
            {novoGrupo && (
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{item.grupo}</p>
            )}
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuAberto(false)}
              className={ativo ? NAV_CLASSE.ativo : NAV_CLASSE.inativo}
            >
              <Icone size={18} />
              {item.label}
            </Link>
            </div>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-white/10 p-4">
        {hasPermission("config.manage") ? (
          <Link href="/suporte" className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${pathname.startsWith("/suporte") ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
            <HelpCircle size={18} /> Suporte dos postos
          </Link>
        ) : (
          <span className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400">
            <HelpCircle size={18} /> Suporte
          </span>
        )}
        {hasPermission("config.manage") ? (
          <Link href="/configuracoes" onClick={() => setMenuAberto(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${["/configuracoes", "/auditoria"].some((h) => pathname.startsWith(h)) ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
            <Settings size={18} /> Configurações
          </Link>
        ) : hasPermission("audit.view") && !restrito ? (
          // Auditor sem acesso às configurações chega à auditoria por aqui
          <Link href="/auditoria" onClick={() => setMenuAberto(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${pathname.startsWith("/auditoria") ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
            <ShieldCheck size={18} /> Auditoria
          </Link>
        ) : null}
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
            <SinoAlertas pathname={pathname} />
            <div className="ml-2 flex items-center gap-3 border-l border-[#C3C6D1]/30 pl-4">
              <div className="text-right leading-tight">
                <span className="block text-sm font-medium text-[#181C22]">{user.name || user.email}</span>
                {restrito && (
                  <span className="block text-xs text-[#737781]">
                    {user.secretarias!.length
                      ? user.secretarias!.map((s) => s.sigla || s.nome).join(", ")
                      : "Nenhuma secretaria vinculada"}
                  </span>
                )}
              </div>
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

/** Sino do topo: abre um painel com os alertas e as notificações; cada item leva à sua página. */
function SinoAlertas({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [alertas, setAlertas] = useState<AlertaAtual[]>([]);
  const [notifs, setNotifs] = useState<NotificacaoItem[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const graves = alertas.filter((a) => a.severidade === "CRITICO" || a.severidade === "ALERTA").length;
  const total = graves + naoLidas;

  const carregar = async () => {
    setCarregando(true);
    try {
      const [a, n] = await Promise.all([api.alertas(), api.notificacoes().catch(() => [] as NotificacaoItem[])]);
      setAlertas(a.itens);
      setNaoLidas(a.notificacoes_nao_lidas);
      setNotifs(n.slice(0, 15));
    } catch {
      /* mantém o que tinha */
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    setAberto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const abrir = (link: string | null | undefined, notif?: NotificacaoItem) => {
    if (notif && !notif.lida) {
      api.marcarLida(notif.id).catch(() => {});
      setNotifs((l) => l.map((x) => (x.id === notif.id ? { ...x, lida: true } : x)));
      setNaoLidas((v) => Math.max(0, v - 1));
    }
    setAberto(false);
    router.push(link || "/notificacoes");
  };

  const marcarTodas = async () => {
    await api.marcarTodasLidas().catch(() => {});
    setNotifs((l) => l.map((x) => ({ ...x, lida: true })));
    setNaoLidas(0);
  };

  const corSev = (s: string) =>
    s === "CRITICO" ? "bg-[#FDECEC] text-[#BA1A1A]" : s === "ALERTA" ? "bg-[#FFF4E0] text-[#B45309]" : "bg-[#EFF4FF] text-[#1D5BD6]";
  const IconeSev = ({ s }: { s: string }) => (s === "CRITICO" || s === "ALERTA" ? <AlertTriangle size={15} /> : <Bell size={15} />);

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => { setAberto((v) => !v); if (!aberto) carregar(); }}
        className={`relative rounded-full p-2 transition-colors hover:bg-[#EFF4FF] ${aberto ? "bg-[#EFF4FF] text-[#1D5BD6]" : ""}`}
        aria-label={total ? `Alertas: ${total} pedindo atenção` : "Alertas"}
        aria-expanded={aberto}
        aria-haspopup="dialog"
      >
        <Bell size={20} />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#BA1A1A] px-1 text-[10px] font-bold text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <div role="dialog" aria-label="Notificações"
          className="absolute right-0 z-50 mt-2 flex max-h-[70vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-[#C3C6D1]/40 bg-white text-left shadow-elevated">
          <div className="flex items-center justify-between border-b border-[#C3C6D1]/30 px-4 py-3">
            <p className="font-semibold text-[#181C22]">Notificações</p>
            {naoLidas > 0 && (
              <button onClick={marcarTodas} className="inline-flex items-center gap-1 text-xs font-medium text-[#1D5BD6] hover:underline">
                <CheckCheck size={14} /> Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {carregando && !alertas.length && !notifs.length && <p className="px-4 py-6 text-center text-sm text-[#737781]">Carregando…</p>}
            {!carregando && !alertas.length && !notifs.length && (
              <p className="px-4 py-8 text-center text-sm text-[#737781]">Nenhuma notificação por aqui.</p>
            )}

            {alertas.length > 0 && (
              <>
                <p className="bg-[#F8F9FF] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#737781]">Alertas</p>
                {alertas.map((a, i) => (
                  <button key={`a${i}`} onClick={() => abrir(a.link)}
                    className="flex w-full items-start gap-3 border-b border-[#C3C6D1]/20 px-4 py-3 text-left hover:bg-[#F3F7FF]">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${corSev(a.severidade)}`}><IconeSev s={a.severidade} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[#181C22]">{a.titulo}</span>
                      {a.descricao && <span className="line-clamp-2 block text-xs text-[#737781]">{a.descricao}</span>}
                    </span>
                    <ChevronRight size={15} className="mt-1 shrink-0 text-[#A0A3AD]" />
                  </button>
                ))}
              </>
            )}

            {notifs.length > 0 && (
              <>
                <p className="bg-[#F8F9FF] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#737781]">Recentes</p>
                {notifs.map((n) => (
                  <button key={n.id} onClick={() => abrir(n.link, n)}
                    className={`flex w-full items-start gap-3 border-b border-[#C3C6D1]/20 px-4 py-3 text-left hover:bg-[#F3F7FF] ${n.lida ? "" : "bg-[#F7FAFF]"}`}>
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${corSev(n.severidade)}`}><IconeSev s={n.severidade} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm text-[#181C22] ${n.lida ? "" : "font-semibold"}`}>{n.titulo}</span>
                      {n.descricao && <span className="line-clamp-2 block text-xs text-[#737781]">{n.descricao}</span>}
                      <span className="block text-[11px] text-[#A0A3AD]">{new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                    </span>
                    {!n.lida && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#1D5BD6]" aria-label="Não lida" />}
                  </button>
                ))}
              </>
            )}
          </div>

          <Link href="/notificacoes" onClick={() => setAberto(false)}
            className="border-t border-[#C3C6D1]/30 px-4 py-2.5 text-center text-sm font-medium text-[#1D5BD6] hover:bg-[#F3F7FF]">
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
