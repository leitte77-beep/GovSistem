"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "ok"; message: string } | { kind: "error"; message: string };

/** Inscrição no boletim: a API manda um e-mail de confirmação (dupla confirmação, LGPD). */
export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await api.newsletterSubscribe(email);
      setState({ kind: "ok", message: res.message });
      setEmail("");
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Não foi possível concluir." });
    }
  };

  if (state.kind === "ok") {
    return (
      <div role="status" className="flex max-w-2xl items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-emerald-700">mark_email_read</span>
        <div>
          <p className="font-bold">Falta só confirmar.</p>
          <p className="mt-1 leading-6">
            {state.message} Abra a mensagem e clique em <strong>Confirmar inscrição</strong>. Se não encontrar, confira a caixa de spam.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <form className="flex max-w-2xl flex-col gap-3 sm:flex-row" onSubmit={submit}>
        <label htmlFor="newsletter-email" className="sr-only">Seu e-mail</label>
        <input
          id="newsletter-email"
          className="h-12 flex-grow rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-blue-100"
          placeholder="seu@email.com"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state.kind === "error"}
          aria-describedby={state.kind === "error" ? "newsletter-error" : undefined}
        />
        <button
          type="submit"
          disabled={state.kind === "sending"}
          className="h-12 rounded-xl bg-brand-900 px-7 text-xs font-bold text-white transition hover:bg-brand-800 disabled:opacity-60"
        >
          {state.kind === "sending" ? "Enviando…" : "Assinar boletim"}
        </button>
      </form>
      {state.kind === "error" && (
        <p id="newsletter-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{state.message}</p>
      )}
      <p className="mt-3 text-[11px] text-slate-600">
        Enviaremos um e-mail para confirmar. Você pode cancelar a qualquer momento pelo link em cada mensagem.
        Ao assinar, você concorda com nossa <Link href="/privacidade" className="underline hover:text-brand-900">Política de Privacidade</Link>.
      </p>
    </>
  );
}
