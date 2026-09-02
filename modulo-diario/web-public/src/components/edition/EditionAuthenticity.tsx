"use client";

import { useState } from "react";
import Link from "next/link";
import type { SnapshotEdition, Authenticity } from "@/lib/edition-types";
import { formatBrasiliaDateTime } from "@/lib/dates";
import EditionStatus from "./EditionStatus";

export type EditionAuthenticityProps = {
  edition: SnapshotEdition;
  authenticity?: Authenticity | null;
  verificationUrl?: string;
  organizationName?: string;
};

/** Extract the human-readable certificate CN from a raw subject string. */
function signerName(subject?: string): string | null {
  if (!subject) return null;
  const cn = subject
    .split(":")
    .map((p) => p.trim())
    .find((p) => /^CN=/i.test(p));
  return cn ? cn.replace(/^CN=/i, "") : subject.split(":")[0].trim() || null;
}

/**
 * Closing "PUBLICAÇÃO AUTENTICADA" band of the edition document. Discreet,
 * documentary — a seal plus the verification code and a link to the
 * authenticity page. Never a heavy dashboard card.
 */
export default function EditionAuthenticity({
  edition,
  authenticity,
  verificationUrl,
}: EditionAuthenticityProps) {
  const [copied, setCopied] = useState(false);

  const code = authenticity?.verification_code || edition.verification_code || "";
  const trusted = Boolean(authenticity?.states.trusted);
  const intact = Boolean(authenticity?.states.intact);
  const first = authenticity?.signatures?.[0];
  const name = signerName(first?.subject);
  const signedAt = first?.signed_at || first?.timestamp || null;
  const hasAuth = Boolean(authenticity);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* noop */
    }
  };

  return (
    <section aria-label="Autenticidade da edição" className="mt-14 border-t border-edition-line-strong pt-10 sm:mt-16">
      {/* seal band */}
      <div className="flex flex-col items-center gap-2 text-center">
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-[22px] ${
            trusted || intact ? "text-[var(--edition-success)]" : "text-[var(--edition-accent)]"
          }`}
        >
          {trusted || intact ? "verified_user" : "lock"}
        </span>
        <p className="text-[13px] font-bold uppercase tracking-[0.32em] text-edition-ink">
          Publicação autenticada
        </p>
        <p className="max-w-md text-[13.5px] leading-relaxed text-edition-muted">
          Esta edição integra o Diário Oficial Eletrônico de{" "}
          <span className="font-semibold text-edition-ink-2">{edition.organization}</span>
          {edition.publication_date ? (
            <> publicado em {formatBrasiliaDateTime(edition.publication_date)}</>
          ) : (
            ""
          )}
          .
        </p>
      </div>

      {hasAuth && name && (
        <div className="mx-auto mt-7 max-w-md rounded-2xl border border-edition-line bg-edition-sheet-muted px-6 py-5 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-edition-muted">
            Assinado digitalmente por
          </p>
          <p className="mt-1.5 text-[16px] font-bold uppercase leading-snug text-edition-ink">{name}</p>
          {signedAt && (
            <p className="mt-0.5 text-[12.5px] text-edition-muted">{formatBrasiliaDateTime(signedAt)}</p>
          )}
          {trusted && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--edition-success)]">
              <span aria-hidden="true" className="material-symbols-outlined text-[15px]">check_circle</span>
              Assinatura válida
            </p>
          )}
        </div>
      )}

      {/* verification code */}
      {code && (
        <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-edition-muted">
            Código de verificação
          </p>
          <div className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-edition-line-strong bg-edition-sheet-muted px-3 py-2">
            <code className="select-all font-mono text-[13px] tracking-wide text-edition-ink">{code}</code>
            <button
              type="button"
              onClick={copyCode}
              aria-live="polite"
              aria-label="Copiar código de verificação"
              className="ml-1 inline-flex items-center rounded-md p-1 text-edition-muted transition hover:text-[var(--edition-accent)]"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                {copied ? "check" : "content_copy"}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* actions */}
      {verificationUrl && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link
            href={verificationUrl}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--edition-accent)] transition hover:text-[var(--edition-accent-strong)]"
          >
            Ver autenticidade
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>
      )}

      {/* technical disclosure (optional, stays quiet) */}
      {hasAuth && <EditionStatus edition={edition} authenticity={authenticity} variant="tech" />}
    </section>
  );
}
