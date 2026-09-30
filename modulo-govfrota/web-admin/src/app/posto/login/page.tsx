"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Fuel } from "lucide-react";
import { portal, salvarToken } from "@/lib/portalPosto";

export default function LoginPosto() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntrando(true);
    try {
      const r = await portal.login(login.trim(), senha);
      salvarToken(r.access_token);
      router.replace("/posto");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-card border border-surface-border bg-white p-6 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-[#1D5BD6] text-white"><Fuel size={20} aria-hidden /></span>
          <div>
            <h1 className="text-h2 text-text-title">Portal do fornecedor</h1>
            <p className="text-meta text-text-subtle">GovFrota · postos credenciados</p>
          </div>
        </div>
        <label className="block text-meta">Login
          <input className="input mt-1" autoComplete="username" autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)} required />
        </label>
        <label className="block text-meta">Senha
          <input type="password" className="input mt-1" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={entrando}>{entrando ? "Entrando…" : "Entrar"}</button>
        <p className="text-meta text-text-subtle">O acesso é criado pelo setor de frota da Prefeitura. Esqueceu a senha? Peça uma nova senha provisória a eles.</p>
      </form>
    </div>
  );
}
