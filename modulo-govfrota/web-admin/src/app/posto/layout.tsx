"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Fuel, LogOut } from "lucide-react";
import { MePosto, portal, POSTO_TOKEN_KEY, sair, salvarToken, SessaoPostoExpirada } from "@/lib/portalPosto";

const NAV = [
  { href: "/posto", label: "Início" },
  { href: "/posto/abastecimentos", label: "Abastecimentos" },
];

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
        <header className="border-b border-surface-border bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-[#1D5BD6] text-white">
                <Fuel size={18} aria-hidden />
              </span>
              <div className="leading-tight">
                <p className="text-label font-semibold text-text-title">{me.posto}</p>
                <p className="text-meta text-text-subtle">Portal do fornecedor · {me.prefeitura}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-body-sm">
              <span className="text-text-subtle">{me.nome}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  sair();
                  router.replace("/posto/login");
                }}
              >
                <LogOut size={15} /> Sair
              </button>
            </div>
          </div>
          {!me.deve_trocar_senha && (
            <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4" aria-label="Portal do fornecedor">
              {NAV.map((n) => {
                const ativo = n.href === "/posto" ? pathname === "/posto" : pathname.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href} aria-current={ativo ? "page" : undefined}
                    className={`border-b-2 px-3 py-2 text-body-sm font-medium ${ativo ? "border-[#1D5BD6] text-[#1D5BD6]" : "border-transparent text-text-subtle hover:text-text-title"}`}>
                    {n.label}
                    {n.href === "/posto/abastecimentos" && pendentes > 0 && (
                      <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-pill bg-[#D92D20] px-1.5 text-[11px] font-semibold leading-5 text-white" aria-label={`${pendentes} nota(s) pendente(s)`}>
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
