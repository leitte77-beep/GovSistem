"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ChevronDown, Fuel, Landmark, LayoutDashboard, LogOut, ReceiptText } from "lucide-react";
import { MePosto, portal, POSTO_TOKEN_KEY, sair, salvarToken, SessaoPostoExpirada } from "@/lib/portalPosto";

const NAV = [
  { href: "/posto", label: "Início", icone: LayoutDashboard },
  { href: "/posto/abastecimentos", label: "Abastecimentos", icone: ReceiptText },
];

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
        className="flex items-center gap-2 rounded-pill border border-surface-border bg-white py-1 pl-1 pr-3 text-body-sm transition hover:bg-[#F3F4F6]">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E5EEFF] text-meta font-semibold text-[#1D4ED8]">{iniciais}</span>
        <span className="hidden max-w-[160px] truncate text-text-title sm:inline">{nome}</span>
        <ChevronDown size={14} className="text-text-subtle" />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-card border border-surface-border bg-white shadow-elevated">
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
    <div className="min-h-screen bg-[#F8F9FF]">
        <header className="sticky top-0 z-30 border-b border-surface-border bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1D5BD6] to-[#123C91] text-white shadow-sm">
                <Fuel size={19} aria-hidden />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-label font-semibold text-text-title">{me.posto}</p>
                <p className="truncate text-meta text-text-subtle">
                  {me.posto_cnpj ? `CNPJ ${me.posto_cnpj}` : "Portal do fornecedor"}
                </p>
              </div>
              {me.prefeitura && (
                <span className="hidden shrink-0 items-center gap-1.5 rounded-pill border border-[#D6E2FF] bg-[#F3F7FF] px-2.5 py-1 text-meta font-medium text-[#1D4ED8] md:inline-flex">
                  <Landmark size={13} aria-hidden /> {me.prefeitura}
                </span>
              )}
            </div>
            <MenuUsuario nome={me.nome} login={me.login} onSair={() => { sair(); router.replace("/posto/login"); }} />
          </div>
          {!me.deve_trocar_senha && (
            <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4" aria-label="Portal do fornecedor">
              {NAV.map((n) => {
                const ativo = n.href === "/posto" ? pathname === "/posto" : pathname.startsWith(n.href);
                const Icone = n.icone;
                return (
                  <Link key={n.href} href={n.href} aria-current={ativo ? "page" : undefined}
                    className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-body-sm font-medium transition ${ativo ? "border-[#1D5BD6] text-[#1D5BD6]" : "border-transparent text-text-subtle hover:text-text-title"}`}>
                    <Icone size={15} aria-hidden />
                    {n.label}
                    {n.href === "/posto/abastecimentos" && pendentes > 0 && (
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-pill bg-[#D92D20] px-1.5 text-[11px] font-semibold leading-5 text-white" aria-label={`${pendentes} nota(s) pendente(s)`}>
                        {pendentes}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">
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
