"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Truck } from "lucide-react";
import { driverApi } from "@/lib/api";

export default function LoginMotoristaPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [pin, setPin] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      await driverApi.login(login, pin);
      router.push("/motorista");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0E1B2E] p-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1D4ED8] text-white">
          <Truck size={32} />
        </div>
        <h1 className="text-2xl font-semibold text-white">GovFrota</h1>
        <p className="text-sm text-[#C7D0DC]">Área do motorista</p>
      </div>

      <form onSubmit={entrar} className="w-full max-w-sm space-y-4">
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Seu login"
          autoComplete="username"
          required
          className="w-full rounded-xl border-0 px-4 py-4 text-lg outline-none"
        />
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border-0 px-4 py-4 text-lg tracking-widest outline-none"
        />
        <button
          disabled={carregando}
          className="w-full rounded-xl bg-[#1D4ED8] py-4 text-lg font-semibold text-white active:bg-[#1E40AF] disabled:opacity-60"
        >
          {carregando ? "Entrando…" : "ENTRAR"}
        </button>
      </form>
    </main>
  );
}
