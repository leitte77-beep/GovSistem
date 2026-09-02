"use client";

import { useState } from "react";
import Link from "next/link";

export type EditionActionsProps = {
  downloadUrl: string;
  viewUrl: string;
  verificationUrl?: string;
  verificationCode?: string;
  shareTitle: string;
};

/**
 * Principal action row of an edition.
 * Visual hierarchy: only "Baixar PDF" is a filled primary action; the rest are
 * quiet text/ghost affordances that never compete with the document.
 */
export default function EditionActions({
  downloadUrl,
  viewUrl,
  verificationUrl,
  shareTitle,
}: EditionActionsProps) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    const url = pageUrl || downloadUrl;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url });
        setShared(true);
        setTimeout(() => setShared(false), 2500);
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    await copyText(url);
  };

  const handleCopy = () => copyText(pageUrl || downloadUrl);

  const icon = (name: string, size = "20px") => (
    <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: size }}>
      {name}
    </span>
  );

  const ghostBase =
    "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-edition-ink-2 ring-1 ring-inset ring-edition-line transition-colors duration-200 hover:bg-edition-sheet-muted hover:text-[var(--edition-accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)]";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--edition-brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--edition-accent-strong)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)]"
        >
          {icon("download")}
          <span>Baixar PDF</span>
        </a>
      )}

      {viewUrl && (
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={ghostBase}
        >
          {icon("visibility")}
          <span>Visualizar</span>
        </a>
      )}

      {verificationUrl && (
        <Link href={verificationUrl} className={ghostBase}>
          {icon("verified_user")}
          <span>Verificar autenticidade</span>
        </Link>
      )}

      <button type="button" onClick={handleShare} className={ghostBase}>
        {icon(shared ? "check" : "share")}
        <span>{shared ? "Compartilhado!" : "Compartilhar"}</span>
      </button>

      <button type="button" onClick={() => window.print()} className={ghostBase}>
        {icon("print")}
        <span>Imprimir</span>
      </button>

      <button
        type="button"
        onClick={handleCopy}
        aria-live="polite"
        className={ghostBase}
      >
        {icon(copied ? "check" : "link")}
        <span>{copied ? "Link copiado." : "Copiar link"}</span>
      </button>
    </div>
  );
}
