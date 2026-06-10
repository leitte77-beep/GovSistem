"use client";
import React, { useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Informe seu e-mail"); return; }
    setLoading(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
      toast.success("Link enviado! Verifique seu e-mail.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar e-mail");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden px-4">
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-40">
        <div className="absolute top-[10%] left-[5%] w-96 h-96 bg-primary-100/40 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] bg-blue-100/30 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-[420px] bg-surface-container-lowest rounded-xl p-8 lg:p-10 border border-outline-variant shadow-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 bg-primary-100 text-primary-600 rounded-lg flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[32px]">lock_reset</span>
          </div>
          <h1 className="text-xl font-extrabold text-on-surface tracking-tight">Recuperar Senha</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {sent ? "Verifique seu e-mail" : "Enviaremos um link de recuperacao"}
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <p>Um e-mail com instrucoes foi enviado para <strong>{email}</strong>.</p>
              <p className="mt-2">O link expira em 30 minutos.</p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Voltar ao login
            </Link>
          </div>
        ) : (
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
                  placeholder="seu@email.com" autoFocus
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
                  <span>Enviando...</span>
                </>
              ) : (
                "Enviar link de recuperacao"
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
    </div>
  );
}
