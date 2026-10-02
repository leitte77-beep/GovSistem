"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowRight, Eye, EyeOff, FileCheck2, Fuel, Loader2, Lock, ReceiptText, ShieldCheck, User } from "lucide-react";
import { portal, salvarToken } from "@/lib/portalPosto";

const RECURSOS = [
  { icone: ReceiptText, titulo: "Abastecimentos do dia", texto: "Veja cada abastecimento registrado pela Prefeitura." },
  { icone: FileCheck2, titulo: "Nota em PDF", texto: "Envie a nota fiscal, uma a uma ou em lote, e o sistema confere." },
  { icone: ShieldCheck, titulo: "Acesso seguro", texto: "Login individual criado pelo setor de frota." },
];

export default function LoginPosto() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntrando(true);
    setErro(false);
    try {
      const r = await portal.login(login.trim(), senha);
      salvarToken(r.access_token);
      router.replace("/posto");
    } catch (err) {
      setErro(true);
      toast.error((err as Error).message);
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#F8F9FF]">
      <style>{`
        @keyframes lp-sobe { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes lp-flutua { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(24px,-28px) scale(1.08); } }
        @keyframes lp-treme { 0%,100% { transform: none; } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
        @keyframes lp-gota { 0% { transform: translateY(-4px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(10px); opacity: 0; } }
        .lp-sobe { animation: lp-sobe .6s cubic-bezier(.2,.7,.2,1) both; }
        .lp-flutua { animation: lp-flutua 14s ease-in-out infinite; }
        .lp-treme { animation: lp-treme .4s ease-in-out; }
        .lp-gota { animation: lp-gota 1.8s ease-in infinite; }
        @media (prefers-reduced-motion: reduce) {
          .lp-sobe, .lp-flutua, .lp-treme, .lp-gota { animation: none !important; }
        }
      `}</style>

      {/* Painel da marca (desktop) */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1D5BD6] via-[#1746AE] to-[#0E2A6B] p-12 text-white lg:flex">
        <div className="lp-flutua pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="lp-flutua pointer-events-none absolute -bottom-32 right-[-6rem] h-96 w-96 rounded-full bg-[#5B8CFF]/30 blur-3xl" style={{ animationDelay: "-7s" }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "22px 22px" }} />

        <div className="lp-sobe relative flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <Fuel size={21} aria-hidden />
            <span className="lp-gota absolute -bottom-1 right-2.5 h-1.5 w-1.5 rounded-full bg-[#9CC0FF]" />
          </span>
          <span className="text-lg font-semibold tracking-tight">GovFrota</span>
        </div>

        <div className="relative space-y-8">
          <div className="lp-sobe space-y-3" style={{ animationDelay: ".1s" }}>
            <h2 className="text-4xl font-semibold leading-tight tracking-tight">Abastecimentos e notas fiscais em um só lugar.</h2>
            <p className="max-w-md text-[15px] text-white/75">Portal dos postos credenciados pela Prefeitura.</p>
          </div>
          <ul className="space-y-3">
            {RECURSOS.map((r, i) => (
              <li key={r.titulo} className="lp-sobe flex gap-3 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-sm transition hover:bg-white/[0.12]"
                style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15"><r.icone size={17} aria-hidden /></span>
                <div>
                  <p className="font-medium">{r.titulo}</p>
                  <p className="text-sm text-white/70">{r.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© {new Date().getFullYear()} GovSistem</p>
      </aside>

      {/* Formulário */}
      <main className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="lp-flutua pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-[#1D5BD6]/10 blur-3xl lg:hidden" />

        <div className="w-full max-w-sm">
          <div className="lp-sobe mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#1D5BD6] to-[#123C91] text-white shadow-md"><Fuel size={21} aria-hidden /></span>
            <span className="text-lg font-semibold text-text-title">GovFrota</span>
          </div>

          <div className="lp-sobe mb-7 space-y-1.5" style={{ animationDelay: ".05s" }}>
            <h1 className="text-[28px] font-semibold tracking-tight text-text-title">Portal do fornecedor</h1>
            <p className="text-body-sm text-text-subtle">Entre com o acesso fornecido pela Prefeitura.</p>
          </div>

          <form key={erro ? "erro" : "ok"} onSubmit={entrar} className={`space-y-4 ${erro ? "lp-treme" : ""}`}>
            <div className="lp-sobe" style={{ animationDelay: ".12s" }}>
              <label htmlFor="lp-login" className="mb-1.5 block text-body-sm font-medium text-text-title">Login</label>
              <div className="group relative">
                <User size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle transition group-focus-within:text-[#1D5BD6]" />
                <input id="lp-login" autoFocus className="input h-12 rounded-xl pl-11 transition-shadow focus:shadow-[0_0_0_4px_rgba(29,91,214,0.12)]"
                  autoComplete="username" autoCapitalize="none" placeholder="seu.login"
                  value={login} onChange={(e) => setLogin(e.target.value)} required />
              </div>
            </div>

            <div className="lp-sobe" style={{ animationDelay: ".18s" }}>
              <label htmlFor="lp-senha" className="mb-1.5 block text-body-sm font-medium text-text-title">Senha</label>
              <div className="group relative">
                <Lock size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle transition group-focus-within:text-[#1D5BD6]" />
                <input id="lp-senha" type={verSenha ? "text" : "password"} className="input h-12 rounded-xl pl-11 pr-11 transition-shadow focus:shadow-[0_0_0_4px_rgba(29,91,214,0.12)]"
                  autoComplete="current-password" placeholder="••••••••"
                  value={senha} onChange={(e) => setSenha(e.target.value)} required />
                <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-text-subtle transition hover:bg-[#EFF4FF] hover:text-[#1D5BD6]">
                  {verSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={entrando}
              className="lp-sobe group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#1D5BD6] to-[#1746AE] font-medium text-white shadow-[0_8px_20px_-6px_rgba(29,91,214,0.55)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-6px_rgba(29,91,214,0.6)] active:translate-y-0 disabled:cursor-wait disabled:opacity-80"
              style={{ animationDelay: ".24s" }}>
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {entrando
                ? <><Loader2 size={18} className="animate-spin" aria-hidden /> Entrando…</>
                : <>Entrar <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-1" /></>}
            </button>
          </form>

          <div className="lp-sobe mt-6 flex gap-3 rounded-xl border border-[#D6E2FF] bg-[#F3F7FF] p-3.5 text-meta text-[#3B4A6B]" style={{ animationDelay: ".3s" }}>
            <ShieldCheck size={17} aria-hidden className="mt-0.5 shrink-0 text-[#1D5BD6]" />
            <p>O acesso é criado pelo setor de frota da Prefeitura. Esqueceu a senha? Peça a eles uma nova senha provisória.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
