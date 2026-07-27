"use client";
import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { toast.error("Token de recuperacao ausente"); return; }
    if (password !== confirm) { toast.error("As senhas nao conferem"); return; }
    if (password.length < 8) { toast.error("A senha deve ter no minimo 8 caracteres"); return; }

    setLoading(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
      toast.success("Senha redefinida com sucesso!");
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: any) {
      toast.error(err.message || "Erro ao redefinir senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl p-8 lg:p-10 border border-outline-variant shadow-sm">
      <div className="flex flex-col items-center mb-8 text-center">
        <div className="w-14 h-14 bg-primary-100 text-primary-600 rounded-lg flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h1 className="text-xl font-extrabold text-on-surface tracking-tight">Nova Senha</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {done ? "Senha atualizada!" : "Crie uma nova senha para sua conta"}
        </p>
      </div>

      {done ? (
        <div className="text-center space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <p>Sua senha foi redefinida com sucesso.</p>
            <p className="mt-1">Redirecionando para o login...</p>
          </div>
        </div>
      ) : !token ? (
        <div className="text-center space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>Token de recuperacao invalido ou ausente.</p>
            <p className="mt-1">Solicite um novo link de recuperacao.</p>
          </div>
          <Link
            href="/login/forgot"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Solicitar novo link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 ml-1" htmlFor="password">
              Nova Senha
            </label>
            <div className="relative flex items-center rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
              <span className="material-symbols-outlined text-outline mr-3 text-[20px]">lock</span>
              <input
                id="password" type={showPassword ? "text" : "password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 8 caracteres" autoFocus
                className="bg-transparent border-none p-0 w-full text-sm text-on-surface focus:ring-0 placeholder:text-outline/50"
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

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 ml-1" htmlFor="confirm">
              Confirmar Senha
            </label>
            <div className="relative flex items-center rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
              <span className="material-symbols-outlined text-outline mr-3 text-[20px]">lock</span>
              <input
                id="confirm" type="password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repita a senha"
                className="bg-transparent border-none p-0 w-full text-sm text-on-surface focus:ring-0 placeholder:text-outline/50"
              />
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full h-12 bg-primary-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Salvando...</span>
              </>
            ) : (
              "Redefinir Senha"
            )}
          </button>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Voltar ao login
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden px-4">
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-40">
        <div className="absolute top-[10%] left-[5%] w-96 h-96 bg-primary-100/40 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] bg-blue-100/30 rounded-full blur-[120px]" />
      </div>

      <Suspense fallback={
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary-600" />
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
