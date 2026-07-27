"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import toast from "react-hot-toast";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { loading: authLoading, user, login } = useAuth();
  const router = useRouter();
  const redirected = useRef(false);

  useEffect(() => {
    if (user && !redirected.current) {
      redirected.current = true;
      router.replace("/");
    }
  }, [user, router]);

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary-600" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Informe email e senha"); return; }
    setLoading(true); setError("");
    try {
      await login(email, password);
      toast.success("Login realizado!");
    } catch (err: any) {
      setError(err.message || "Email ou senha invalidos");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between items-center bg-background relative overflow-hidden">
      {/* Decorative backgrounds */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-40">
        <div className="absolute top-[10%] left-[5%] w-96 h-96 bg-primary-100/40 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] bg-blue-100/30 rounded-full blur-[120px]" />
      </div>

      <div className="hidden lg:block h-20" />

      <main className="flex-grow flex items-center justify-center w-full px-4">
        <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl p-8 lg:p-10 border border-outline-variant shadow-sm">
          {/* Brand */}
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-14 h-14 bg-primary-100 text-primary-600 rounded-lg flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px]">account_balance</span>
            </div>
            <h1 className="text-xl font-extrabold text-primary tracking-tight">GovSistem</h1>
            <p className="text-sm text-on-surface-variant mt-1">Painel Administrativo</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 ml-1" htmlFor="email">
                Email
              </label>
              <div className="relative flex items-center rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
                <span className="material-symbols-outlined text-outline mr-3 text-[20px]">mail</span>
                <input
                  id="email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@saas.com" autoFocus
                  autoComplete="off"
                  className="bg-transparent border-none outline-none p-0 w-full text-sm text-on-surface focus:ring-0 focus:outline-none placeholder:text-outline/50"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5 px-1">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="password">
                  Senha
                </label>
                <Link href="/login/forgot" className="text-xs font-medium text-primary hover:underline">
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative flex items-center rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
                <span className="material-symbols-outlined text-outline mr-3 text-[20px]">lock</span>
                <input
                  id="password" type={showPassword ? "text" : "password"}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  autoComplete="new-password"
                  className="bg-transparent border-none outline-none p-0 w-full text-sm text-on-surface focus:ring-0 focus:outline-none placeholder:text-outline/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="ml-2 text-outline hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 ml-1 cursor-pointer select-none">
              <input type="checkbox" className="rounded border-outline-variant text-primary-600 focus:ring-primary-500 w-4 h-4" />
              <span className="text-xs text-on-surface-variant">Lembrar acesso</span>
            </label>

            <button
              type="submit" disabled={loading}
              className="w-full h-12 bg-primary-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <span>Entrar</span>
                  <span className="material-symbols-outlined text-lg">login</span>
                </>
              )}
            </button>
          </form>

          {/* Support */}
          <div className="mt-10 pt-7 border-t border-outline-variant text-center">
            <p className="text-xs text-on-surface-variant">
              Problemas com o acesso?{" "}
              <a href="mailto:contato@govsistem.com.br" className="text-primary font-semibold hover:underline">
                Contate o suporte tecnico
              </a>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 flex flex-col items-center gap-3">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 px-4">
          <a href="#" className="text-xs text-on-surface-variant hover:text-primary transition-colors">Termos de Uso</a>
          <a href="#" className="text-xs text-on-surface-variant hover:text-primary transition-colors">Privacidade</a>
          <a href="#" className="text-xs text-on-surface-variant hover:text-primary transition-colors">Ajuda</a>
          <a href="#" className="text-xs text-on-surface-variant hover:text-primary transition-colors">Seguranca</a>
        </div>
        <p className="text-xs text-outline/70">
          &copy; 2024 GovSistem. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
