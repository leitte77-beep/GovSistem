"use client";
import React, { useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Informe seu e-mail"); return; }
    setLoading(true);
    setNotFound(false);
    try {
      const res = await api<{ message: string; exists?: boolean }>("/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
      if (res?.exists === false) {
        setNotFound(true);
        toast.error("Este e-mail não está cadastrado.");
      } else {
        setSent(true);
        toast.success("Link enviado! Verifique seu e-mail.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar e-mail");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-container relative overflow-hidden px-4 py-10">
      {/* Ambient gradient blobs */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[8%] w-[480px] h-[480px] bg-primary-100/50 rounded-full blur-[130px]" />
        <div className="absolute bottom-[-15%] right-[5%] w-[560px] h-[560px] bg-sky-200/40 rounded-full blur-[140px]" />
        <div className="absolute top-[45%] left-[45%] w-[320px] h-[320px] bg-emerald-100/30 rounded-full blur-[110px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #1a1a2e 1px, transparent 1px), linear-gradient(to bottom, #1a1a2e 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="w-full max-w-[440px]">
        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/25">
            <span className="material-symbols-outlined text-white text-[20px]">account_balance</span>
          </div>
          <span className="text-lg font-bold text-on-surface tracking-tight">
            Gov<span className="text-primary-600">Sistem</span>
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-8 lg:p-10 border border-outline-variant/60 shadow-xl shadow-black/5">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 bg-primary-500/20 rounded-full blur-xl scale-125" />
              <div className="relative w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary-600/30 rotate-3">
                <span className="material-symbols-outlined text-[34px] -rotate-3">lock_reset</span>
              </div>
            </div>
            <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">
              {sent ? "Confira seu e-mail" : "Recuperar senha"}
            </h1>
            <p className="text-sm text-on-surface-variant mt-2 leading-relaxed max-w-[300px]">
              {sent
                ? "Enviamos um link seguro de recuperação para o seu e-mail."
                : "Informe o e-mail cadastrado e enviaremos um link para você redefinir sua senha."}
            </p>
          </div>

          {sent ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <span className="material-symbols-outlined text-[22px]">mark_email_read</span>
                </div>
                <p className="text-sm text-emerald-800">
                  Link enviado para <strong className="font-semibold">{email}</strong>
                </p>
                <p className="mt-1.5 text-xs text-emerald-600">
                  O link expira em 30 minutos. Não esqueça de verificar a caixa de spam.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                <a
                  href={`mailto:${email}`}
                  className="w-full h-11 bg-primary-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary-700 active:scale-[0.98] transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  Abrir meu e-mail
                </a>
                <Link
                  href="/login"
                  className="w-full h-11 rounded-xl text-sm font-medium flex items-center justify-center gap-2 text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Voltar ao login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 ml-1"
                  htmlFor="email"
                >
                  E-mail cadastrado
                </label>
                <div
                  className={`relative flex items-center rounded-xl border bg-surface-container-low px-4 py-3.5 transition-all focus-within:ring-2 ${
                    notFound
                      ? "border-red-300 focus-within:border-red-500 focus-within:ring-red-500/15"
                      : "border-outline-variant focus-within:border-primary-500 focus-within:ring-primary-500/20"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined mr-3 text-[20px] ${
                      notFound ? "text-red-400" : "text-outline"
                    }`}
                  >
                    mail
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (notFound) setNotFound(false);
                    }}
                    placeholder="seu@email.com"
                    autoFocus
                    className="bg-transparent border-none p-0 w-full text-sm text-on-surface focus:ring-0 placeholder:text-outline/50 outline-none"
                  />
                </div>
                {notFound && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 animate-[fadeIn_0.2s_ease-out]">
                    <span className="material-symbols-outlined text-[16px] mt-px shrink-0">error</span>
                    <span>
                      Este e-mail <strong className="font-semibold">não está cadastrado</strong> em nossa
                      plataforma. Verifique se digitou corretamente ou crie uma conta.
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-primary-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-600/25 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none shadow-md shadow-primary-600/20"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">send</span>
                    Enviar link de recuperação
                  </>
                )}
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-outline-variant/60" />
                <span className="text-[11px] uppercase tracking-wider text-outline">ou</span>
                <div className="h-px flex-1 bg-outline-variant/60" />
              </div>

              <div className="flex items-center justify-center gap-5 text-sm">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 font-medium text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Voltar ao login
                </Link>
                <span className="text-outline-variant">·</span>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 font-medium text-primary hover:text-primary-700 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                  Criar conta
                </Link>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-on-surface-variant/70 flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]">shield_lock</span>
          Seus dados estão protegidos com criptografia
        </p>
      </div>
    </div>
  );
}
