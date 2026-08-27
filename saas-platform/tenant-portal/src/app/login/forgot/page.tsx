"use client";
import { useState } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao solicitar recuperação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-container p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white">
            <Mail size={24} />
          </span>
          <h1 className="text-xl font-semibold text-on-surface">Recuperar senha</h1>
          <p className="text-sm text-on-surface-variant">Informe seu e-mail para receber o link.</p>
        </div>

        {sent ? (
          <p className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            Se o e-mail existir, um link de recuperação foi enviado. Verifique sua caixa de entrada.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-on-surface-variant">E-mail</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
                  placeholder="voce@orgao.gov.br"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
            >
              <Send size={15} /> {busy ? "Enviando..." : "Enviar link"}
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-4 flex items-center justify-center gap-1 text-center text-xs text-primary-700 underline"
        >
          <ArrowLeft size={12} /> Voltar para o login
        </Link>
      </div>
    </div>
  );
}
