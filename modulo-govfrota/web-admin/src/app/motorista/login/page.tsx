"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowRight, Eye, EyeOff, Fuel, Loader2, Lock, ShieldCheck, Truck, User, UserRound } from "lucide-react";
import { driverApi } from "@/lib/api";

const ULTIMO_LOGIN = "govfrota_motorista_ultimo_login";

function lerUltimo(): string {
  try {
    return localStorage.getItem(ULTIMO_LOGIN) ?? "";
  } catch {
    return "";
  }
}
function guardarUltimo(v: string) {
  try {
    if (v) localStorage.setItem(ULTIMO_LOGIN, v);
    else localStorage.removeItem(ULTIMO_LOGIN);
  } catch {
    /* navegação privada */
  }
}

export default function LoginMotoristaPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [lembrado, setLembrado] = useState("");
  const [pin, setPin] = useState("");
  const [mostrarPin, setMostrarPin] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(0);
  // Lido só depois de montar: no servidor não há window, e decidir no
  // primeiro render faria o HTML divergir da hidratação (React #418).
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const loginRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSessaoExpirada(new URLSearchParams(window.location.search).get("expirado") === "1");
    const u = lerUltimo();
    if (u) {
      setLogin(u);
      setLembrado(u);
      setTimeout(() => pinRef.current?.focus(), 350);
    }
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 6) {
      toast.error("O PIN tem pelo menos 6 números.");
      pinRef.current?.focus();
      return;
    }
    setCarregando(true);
    try {
      await driverApi.login(login.trim(), pin);
      guardarUltimo(login.trim());
      if (navigator.vibrate) navigator.vibrate(30);
      router.replace("/motorista");
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      setErro((n) => n + 1);
      setPin("");
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      // 403 (bloqueado) e 429 (muitas tentativas) preservam a mensagem.
      toast.error(status === 401 ? "Usuário ou PIN inválido." : (err as Error).message);
      pinRef.current?.focus();
    } finally {
      setCarregando(false);
    }
  }

  const trocarUsuario = () => {
    guardarUltimo("");
    setLembrado("");
    setLogin("");
    setPin("");
    setTimeout(() => loginRef.current?.focus(), 50);
  };

  const slots = Math.max(6, pin.length);
  const primeiroNome = lembrado ? lembrado.split(/[.\s_-]/)[0] : "";

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#0B1B3F] text-white">
      <style>{`
        @keyframes ml-sobe { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
        @keyframes ml-surge { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
        @keyframes ml-flutua { 0%,100% { transform: translate(0,0); } 50% { transform: translate(20px,-24px); } }
        @keyframes ml-estrada { from { background-position: 0 0; } to { background-position: 0 64px; } }
        @keyframes ml-treme { 0%,100% { transform: none; } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
        @keyframes ml-ponto { from { transform: scale(.4); } to { transform: scale(1); } }
        .ml-sobe { animation: ml-sobe .6s cubic-bezier(.2,.8,.2,1) both; }
        .ml-surge { animation: ml-surge .5s cubic-bezier(.2,.8,.2,1) both; }
        .ml-flutua { animation: ml-flutua 12s ease-in-out infinite; }
        .ml-estrada { animation: ml-estrada 1.2s linear infinite; }
        .ml-treme { animation: ml-treme .4s ease-in-out; }
        .ml-ponto { animation: ml-ponto .18s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .ml-sobe, .ml-surge, .ml-flutua, .ml-estrada, .ml-treme, .ml-ponto { animation: none !important; }
        }
      `}</style>

      {/* Fundo */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-[#1D5BD6] via-[#123C91] to-[#0B1B3F]" />
        <div className="ml-flutua absolute -left-24 -top-20 h-72 w-72 rounded-full bg-[#5B8CFF]/40 blur-3xl" />
        <div className="ml-flutua absolute -right-20 top-40 h-64 w-64 rounded-full bg-[#22D3EE]/20 blur-3xl" style={{ animationDelay: "-6s" }} />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      </div>

      {/* Topo: marca */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-6 text-center"
        style={{ paddingTop: "max(env(safe-area-inset-top), 2.5rem)" }}>
        <div className="ml-surge relative mb-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 shadow-2xl ring-1 ring-white/30 backdrop-blur">
            <Truck size={38} aria-hidden />
          </div>
          <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-[#22C55E] shadow-lg ring-4 ring-[#123C91]">
            <Fuel size={17} aria-hidden />
          </span>
        </div>
        <h1 className="ml-surge text-[28px] font-bold tracking-tight" style={{ animationDelay: ".08s" }}>GovFrota</h1>
        <p className="ml-surge text-[15px] text-white/75" style={{ animationDelay: ".14s" }}>Área do motorista</p>
        {/* Faixa de estrada animada */}
        <div className="ml-surge mt-6 h-10 w-1.5 rounded-full opacity-60" style={{ animationDelay: ".2s" }}>
          <div className="ml-estrada h-full w-full rounded-full"
            style={{ backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,.9) 0 50%, transparent 50% 100%)", backgroundSize: "100% 32px" }} />
        </div>
      </section>

      {/* Cartão inferior (bottom sheet) */}
      <section className="ml-sobe relative rounded-t-[32px] bg-white px-6 pt-7 text-[#0F172A] shadow-[0_-20px_50px_-20px_rgba(0,0,0,.5)] sm:mx-auto sm:mb-10 sm:w-full sm:max-w-md sm:rounded-[32px] sm:pb-8"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.75rem)", animationDelay: ".1s" }}>
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-[#E2E8F0] sm:hidden" aria-hidden />

        {sessaoExpirada && (
          <div className="mb-4 rounded-2xl bg-[#FFF4D6] px-4 py-3 text-[15px] text-[#7A4B00]">
            Sua sessão expirou. Entre novamente para continuar.
          </div>
        )}

        <form key={erro} onSubmit={entrar} className={`space-y-5 ${erro ? "ml-treme" : ""}`}>
          {lembrado ? (
            <div className="flex items-center gap-3 rounded-2xl bg-[#F1F5FF] p-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1D5BD6] to-[#123C91] text-white">
                <UserRound size={22} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-[#64748B]">Olá{primeiroNome ? `, ${primeiroNome}` : ""}!</p>
                <p className="truncate text-[16px] font-semibold">{lembrado}</p>
              </div>
              <button type="button" onClick={trocarUsuario} className="shrink-0 rounded-xl px-3 py-2 text-[14px] font-medium text-[#1D5BD6] active:bg-[#E0E9FF]">
                Trocar
              </button>
            </div>
          ) : (
            <label className="block">
              <span className="mb-2 block text-[15px] font-semibold">Usuário</span>
              <div className="relative">
                <User size={20} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  ref={loginRef}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Seu usuário"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pinRef.current?.focus(); } }}
                  required
                  className="h-14 w-full rounded-2xl border-2 border-[#E2E8F0] bg-[#F8FAFC] pl-12 pr-4 text-[17px] outline-none transition focus:border-[#1D5BD6] focus:bg-white"
                />
              </div>
            </label>
          )}

          <div>
            <label htmlFor="ml-pin" className="mb-2 flex items-center justify-between text-[15px] font-semibold">
              <span>PIN</span>
              <button type="button" onClick={() => setMostrarPin((m) => !m)} aria-label={mostrarPin ? "Ocultar PIN" : "Mostrar PIN"}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-[#64748B] active:bg-[#F1F5F9]">
                {mostrarPin ? <EyeOff size={16} /> : <Eye size={16} />} {mostrarPin ? "Ocultar" : "Mostrar"}
              </button>
            </label>
            {/* Campo real (teclado numérico e preenchimento automático) por baixo dos pontinhos */}
            <div className="relative" onClick={() => pinRef.current?.focus()}>
              <Lock size={20} aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#94A3B8]" />
              <input
                id="ml-pin"
                ref={pinRef}
                type={mostrarPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="current-password"
                enterKeyHint="go"
                maxLength={12}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                required
                className={`peer h-14 w-full rounded-2xl border-2 border-[#E2E8F0] bg-[#F8FAFC] pl-12 pr-4 text-[20px] tracking-[0.4em] outline-none transition focus:border-[#1D5BD6] focus:bg-white ${mostrarPin ? "" : "text-transparent caret-transparent"}`}
              />
              {!mostrarPin && (
                <div className="pointer-events-none absolute inset-y-0 left-12 right-4 flex items-center gap-2.5" aria-hidden>
                  {Array.from({ length: slots }).map((_, i) => (
                    <span key={i} className={`h-3.5 w-3.5 rounded-full transition ${i < pin.length ? "ml-ponto bg-[#1D5BD6]" : "bg-[#CBD5E1]"}`} />
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-[13px] text-[#64748B]">De 6 a 12 números.</p>
          </div>

          <button
            type="submit"
            disabled={carregando || !login.trim()}
            className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#1D5BD6] to-[#123C91] text-[18px] font-semibold text-white shadow-[0_12px_24px_-10px_rgba(29,91,214,.7)] transition active:scale-[.98] disabled:opacity-60"
          >
            {carregando ? <><Loader2 size={20} className="animate-spin" /> Entrando…</> : <>Entrar <ArrowRight size={20} className="transition group-active:translate-x-1" /></>}
          </button>
        </form>

        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[#F8FAFC] p-4 text-[14px] text-[#475569]">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#1D5BD6]" aria-hidden />
          <p>Esqueceu o PIN ou está bloqueado? Fale com o setor de frota da Prefeitura para receber um novo.</p>
        </div>
      </section>
    </main>
  );
}
