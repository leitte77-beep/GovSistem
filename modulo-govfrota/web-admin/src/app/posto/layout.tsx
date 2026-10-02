"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ChevronDown, Fuel, Landmark, LayoutDashboard, LifeBuoy, LogOut, ReceiptText } from "lucide-react";
import { MePosto, portal, POSTO_TOKEN_KEY, sair, salvarToken, SessaoPostoExpirada } from "@/lib/portalPosto";

const NAV = [
  { href: "/posto", label: "Início", icone: LayoutDashboard },
  { href: "/posto/abastecimentos", label: "Abastecimentos", icone: ReceiptText },
  { href: "/posto/suporte", label: "Suporte", icone: LifeBuoy },
];

/** Animações do portal (respeitam "reduzir movimento"). */
const ESTILO_PORTAL = `
@keyframes pp-sobe { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes pp-flutua { 0%,100% { transform: translate(0,0); } 50% { transform: translate(30px,-20px); } }
@keyframes pp-surge { from { opacity: 0; } to { opacity: 1; } }
@keyframes pp-pulso { 0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,.45); } 50% { box-shadow: 0 0 0 10px rgba(245,158,11,0); } }
.pp-sobe { animation: pp-sobe .55s cubic-bezier(.2,.7,.2,1) both; }
.pp-sobe-1 { animation-delay: .05s; } .pp-sobe-2 { animation-delay: .1s; } .pp-sobe-3 { animation-delay: .15s; } .pp-sobe-4 { animation-delay: .2s; } .pp-sobe-5 { animation-delay: .25s; }
.pp-surge { animation: pp-surge .4s ease both; }
.pp-flutua { animation: pp-flutua 16s ease-in-out infinite; }
.pp-pulso { animation: pp-pulso 2.2s ease-in-out infinite; }
.pp-cartao { transition: transform .2s ease, box-shadow .2s ease; }
.pp-cartao:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -12px rgba(15,42,107,.25); }
@media (prefers-reduced-motion: reduce) { .pp-sobe, .pp-surge, .pp-flutua, .pp-pulso { animation: none !important; } .pp-cartao:hover { transform: none; } }
`;

function MenuUsuario({ nome, login, onSair }: { nome: string; login: string; onSair: () => void }) {
  const [aberto, setAberto] = useState(false);
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    window.addEventListener("click", fechar);
    return () => window.removeEventListener("click", fechar);
  }, [aberto]);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setAberto(!aberto)} aria-haspopup="menu" aria-expanded={aberto}
        className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm text-white ring-1 ring-white/20 transition hover:bg-white/20">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#153B8F]">{iniciais}</span>
        <span className="hidden max-w-[160px] truncate sm:inline">{nome}</span>
        <ChevronDown size={14} className="text-white/70" />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-card border border-surface-border bg-white shadow-elevated">
          <div className="border-b border-surface-border px-4 py-3">
            <p className="truncate text-body-sm font-medium text-text-title">{nome}</p>
            <p className="truncate text-meta text-text-subtle">{login}</p>
          </div>
          <button role="menuitem" onClick={onSair} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-[#B42318] hover:bg-[#FEF3F2]">
            <LogOut size={15} /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

export default function PostoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MePosto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const naLogin = pathname === "/posto/login";
  const [pendentes, setPendentes] = useState(0);

  const carregar = useCallback(async () => {
    let temToken = false;
    try {
      temToken = !!localStorage.getItem(POSTO_TOKEN_KEY);
    } catch {
      /* sem storage */
    }
    if (!temToken) {
      setCarregando(false);
      if (!naLogin) router.replace("/posto/login");
      return;
    }
    try {
      setMe(await portal.me());
    } catch (e) {
      if (e instanceof SessaoPostoExpirada) router.replace("/posto/login");
      else toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [naLogin, router]);

  useEffect(() => {
    if (!naLogin) carregar();
    else setCarregando(false);
  }, [carregar, naLogin]);

  // Contador do menu: abastecimentos ainda sem nota fiscal.
  useEffect(() => {
    if (!me || me.deve_trocar_senha) return;
    const atualizar = () => portal.painel().then((p) => setPendentes(p.notas.pendentes)).catch(() => setPendentes(0));
    atualizar();
    window.addEventListener("posto:nota-enviada", atualizar);
    return () => window.removeEventListener("posto:nota-enviada", atualizar);
  }, [me, pathname]);

  if (naLogin) return <div className="min-h-screen bg-[#F8F9FF]">{children}</div>;
  if (carregando || !me) return <div className="min-h-screen bg-[#F8F9FF]" />;

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      <style>{ESTILO_PORTAL}</style>
      <header className="relative z-20 bg-gradient-to-br from-[#0E2A6B] via-[#153B8F] to-[#1D5BD6] text-white">
        {/* Decoração em camada própria: o header não pode cortar o menu do usuário. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="pp-flutua absolute -left-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pp-flutua absolute -right-16 top-0 h-64 w-64 rounded-full bg-[#5B8CFF]/30 blur-3xl" style={{ animationDelay: "-8s" }} />
          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        </div>

        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Fuel size={21} aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-semibold">{me.posto}</p>
              <p className="truncate text-xs text-white/70">
                {me.posto_cnpj ? `CNPJ ${me.posto_cnpj}` : "Portal do fornecedor"}
              </p>
            </div>
            {me.prefeitura && (
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20 md:inline-flex">
                <Landmark size={13} aria-hidden /> {me.prefeitura}
              </span>
            )}
          </div>
          <MenuUsuario nome={me.nome} login={me.login} onSair={() => { sair(); router.replace("/posto/login"); }} />
        </div>

        {!me.deve_trocar_senha && (
          <nav className="relative mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-0 pt-5" aria-label="Portal do fornecedor">
            {NAV.map((n) => {
              const ativo = n.href === "/posto" ? pathname === "/posto" : pathname.startsWith(n.href);
              const Icone = n.icone;
              return (
                <Link key={n.href} href={n.href} aria-current={ativo ? "page" : undefined}
                  className={`relative inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-medium transition ${ativo ? "bg-[#F4F6FB] text-[#153B8F]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
                  <Icone size={16} aria-hidden />
                  {n.label}
                  {n.href === "/posto/abastecimentos" && pendentes > 0 && (
                    <span className="pp-pulso inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#F59E0B] px-1.5 text-[11px] font-bold leading-5 text-[#3B2300]" aria-label={`${pendentes} nota(s) pendente(s)`}>
                      {pendentes}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        )}
        {me.deve_trocar_senha && <div className="h-6" />}
      </header>
      <main key={pathname} className="pp-surge mx-auto max-w-7xl px-4 py-7">
        {me.deve_trocar_senha ? <TrocarSenha onOk={carregar} /> : children}
      </main>
    </div>
  );
}

function TrocarSenha({ onOk }: { onOk: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nova !== conf) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }
    setSalvando(true);
    try {
      const r = await portal.trocarSenha(atual, nova);
      salvarToken(r.access_token);
      toast.success("Senha alterada.");
      onOk();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mx-auto max-w-md space-y-4 rounded-card border border-surface-border bg-white p-6 shadow-card">
      <div>
        <h1 className="text-h2 text-text-title">Defina sua senha</h1>
        <p className="text-body-sm text-text-subtle">Você entrou com a senha provisória. Crie uma senha pessoal com pelo menos 8 caracteres, com letras e números.</p>
      </div>
      <label className="block text-meta">Senha provisória
        <input type="password" className="input mt-1" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
      </label>
      <label className="block text-meta">Nova senha
        <input type="password" className="input mt-1" autoComplete="new-password" minLength={8} value={nova} onChange={(e) => setNova(e.target.value)} required />
      </label>
      <label className="block text-meta">Confirme a nova senha
        <input type="password" className="input mt-1" autoComplete="new-password" minLength={8} value={conf} onChange={(e) => setConf(e.target.value)} required />
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={salvando}>{salvando ? "Salvando…" : "Salvar senha"}</button>
    </form>
  );
}
