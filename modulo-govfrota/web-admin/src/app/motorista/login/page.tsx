"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Eye, EyeOff, Truck } from "lucide-react";
import { driverApi } from "@/lib/api";

export default function LoginMotoristaPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [pin, setPin] = useState("");
  const [mostrarPin, setMostrarPin] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [sessaoExpirada] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("expirado") === "1"
  );

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      await driverApi.login(login, pin);
      router.replace("/motorista");
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        toast.error("Usuário ou PIN inválido.");
      } else {
        // 403 (bloqueado) e 429 (muitas tentativas) preservam a mensagem.
        toast.error((err as Error).message);
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#151E2F] p-6" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1D5BD6] text-white">
          <Truck size={32} />
        </div>
        <h1 className="text-2xl font-semibold text-white">GovFrota</h1>
        <p className="text-sm text-[#C7D0DC]">Área do motorista</p>
      </div>

      {sessaoExpirada && (
        <div className="mb-4 w-full max-w-sm rounded-xl border border-[#FFDD9A] bg-[#FFDD9A]/15 px-4 py-3 text-sm text-[#FFDD9A]">
          Sua sessão expirou. Entre novamente para continuar.
        </div>
      )}

      <form onSubmit={entrar} className="w-full max-w-sm space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white">Usuário</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Seu usuário"
            autoComplete="username"
            autoCapitalize="none"
            required
            className="w-full rounded-xl border-0 bg-white px-4 py-4 text-lg outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white">PIN</span>
          <div className="relative">
            <input
              type={mostrarPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              required
              className="w-full rounded-xl border-0 bg-white px-4 py-4 pr-14 text-lg tracking-widest outline-none"
            />
            <button
              type="button"
              onClick={() => setMostrarPin((m) => !m)}
              aria-label={mostrarPin ? "Ocultar PIN" : "Mostrar PIN"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#424750] hover:bg-[#EFF4FF]"
            >
              {mostrarPin ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>

        <button
          disabled={carregando}
          className="w-full rounded-xl bg-[#1D5BD6] py-4 text-lg font-semibold text-white active:bg-[#1E40AF] disabled:opacity-60"
        >
          {carregando ? "Entrando…" : "ENTRAR"}
        </button>
      </form>
    </main>
  );
}
