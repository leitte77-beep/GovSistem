"use client";
import { useState } from "react";
import { ArrowLeft, Mail, Send, ShieldCheck, MailCheck, UserPlus, CircleAlert, LockKeyhole } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotFound(false);
    try {
      const res = await api<{ message: string; exists?: boolean }>("/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
      if (res?.exists === false) {
        setNotFound(true);
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao solicitar recuperação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-container relative overflow-hidden px-4 py-10">
      {/* Ambient gradient blobs */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[8%] h-[480px] w-[480px] rounded-full bg-primary-100/50 blur-[130px]" />
        <div className="absolute bottom-[-15%] right-[5%] h-[560px] w-[560px] rounded-full bg-sky-200/40 blur-[140px]" />
        <div className="absolute left-[45%] top-[45%] h-[320px] w-[320px] rounded-full bg-emerald-100/30 blur-[110px]" />
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
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 shadow-lg shadow-primary-600/25">
            <LockKeyhole size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-on-surface">
            Gov<span className="text-primary-600">Sistem</span>
          </span>
        </div>

        <div className="rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-8 shadow-xl shadow-black/5 lg:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 scale-125 rounded-full bg-primary-500/20 blur-xl" />
              <div className="relative flex h-16 w-16 rotate-3 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-600/30">
                <LockKeyhole size={28} className="-rotate-3" />
              </div>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">
              {sent ? "Confira seu e-mail" : "Recuperar senha"}
            </h1>
            <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-on-surface-variant">
              {sent
                ? "Enviamos um link seguro de recuperação para o seu e-mail."
                : "Informe o e-mail cadastrado e enviaremos um link para você redefinir sua senha."}
            </p>
          </div>

          {sent ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <MailCheck size={20} />
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
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-700 active:scale-[0.98]"
                >
                  <Send size={16} />
                  Abrir meu e-mail
                </a>
                <Link
                  href="/login"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
                >
                  <ArrowLeft size={16} />
                  Voltar ao login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5" noValidate>
              <div>
                <label
                  className="mb-1.5 ml-1 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
                  htmlFor="email"
                >
                  E-mail cadastrado
                </label>
                <div
                  className={`relative flex items-center rounded-xl border bg-surface-container-low px-4 py-3.5 transition-all focus-within:ring-2 ${
                    notFound || error
                      ? "border-red-300 focus-within:border-red-500 focus-within:ring-red-500/15"
                      : "border-outline-variant focus-within:border-primary-500 focus-within:ring-primary-500/20"
                  }`}
                >
                  <Mail
                    size={18}
                    className={`mr-3 ${notFound || error ? "text-red-400" : "text-on-surface-variant/60"}`}
                  />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setNotFound(false);
                      setError("");
                    }}
                    placeholder="voce@orgao.gov.br"
                    autoFocus
                    className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40"
                  />
                </div>
                {(notFound || error) && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                    <CircleAlert size={15} className="mt-px shrink-0" />
                    <span>
                      {notFound ? (
                        <>
                          Este e-mail <strong className="font-semibold">não está cadastrado</strong> em
                          nossa plataforma. Verifique se digitou corretamente ou crie uma conta.
                        </>
                      ) : (
                        error
                      )}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-600/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Enviar link de recuperação
                  </>
                )}
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-outline-variant/60" />
                <span className="text-[11px] uppercase tracking-wider text-on-surface-variant/60">ou</span>
                <div className="h-px flex-1 bg-outline-variant/60" />
              </div>

              <div className="flex items-center justify-center gap-5 text-sm">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 font-medium text-on-surface-variant transition-colors hover:text-primary"
                >
                  <ArrowLeft size={15} />
                  Voltar ao login
                </Link>
                <span className="text-outline-variant">·</span>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:text-primary-700"
                >
                  <UserPlus size={15} />
                  Criar conta
                </Link>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-on-surface-variant/70">
          <ShieldCheck size={14} />
          Seus dados estão protegidos com criptografia
        </p>
      </div>
    </div>
  );
}
