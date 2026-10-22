"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

type Props = { action: "confirm" | "unsubscribe" };

const COPY = {
  confirm: {
    loading: "Confirmando sua inscrição…",
    title: "Inscrição confirmada",
    body: (email: string) => `A partir da próxima edição, ${email} vai receber o Diário Oficial por e-mail.`,
    icon: "mark_email_read",
  },
  unsubscribe: {
    loading: "Cancelando sua inscrição…",
    title: "Inscrição cancelada",
    body: (email: string) => `${email} não vai mais receber o boletim. Você pode se inscrever de novo quando quiser, pela página inicial.`,
    icon: "unsubscribe",
  },
};

/** Executa confirmar/cancelar a partir do link do e-mail (?token=...). */
export default function NewsletterTokenAction({ action }: Props) {
  const token = useSearchParams().get("token") || "";
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ok"; email: string } | { kind: "error"; message: string }>(
    token ? { kind: "loading" } : { kind: "error", message: "Link incompleto. Abra o link direto do e-mail." },
  );
  const done = useRef(false);

  useEffect(() => {
    if (!token || done.current) return;
    done.current = true;
    const call = action === "confirm" ? api.newsletterConfirm : api.newsletterUnsubscribe;
    call(token)
      .then((r) => setState({ kind: "ok", email: r.email }))
      .catch((e) => setState({ kind: "error", message: e instanceof Error ? e.message : "Link inválido." }));
  }, [token, action]);

  const copy = COPY[action];
  return (
    <section className="mx-auto max-w-xl px-4 py-16 sm:py-24">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="status" aria-live="polite">
        {state.kind === "loading" && <p className="text-slate-600">{copy.loading}</p>}
        {state.kind === "ok" && (
          <>
            <span aria-hidden="true" className="material-symbols-outlined text-5xl text-emerald-700">{copy.icon}</span>
            <h1 className="mt-3 text-2xl font-extrabold text-brand-900">{copy.title}</h1>
            <p className="mt-3 leading-7 text-slate-600">{copy.body(state.email)}</p>
          </>
        )}
        {state.kind === "error" && (
          <>
            <span aria-hidden="true" className="material-symbols-outlined text-5xl text-amber-600">link_off</span>
            <h1 className="mt-3 text-2xl font-extrabold text-brand-900">Não foi possível concluir</h1>
            <p className="mt-3 leading-7 text-slate-600">{state.message}</p>
          </>
        )}
        <Link href="/" className="mt-8 inline-flex h-11 items-center rounded-xl bg-brand-900 px-6 text-sm font-bold text-white hover:bg-brand-800">
          Ir para o Diário Oficial
        </Link>
      </div>
    </section>
  );
}
