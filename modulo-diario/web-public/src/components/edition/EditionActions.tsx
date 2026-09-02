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
 * Principal action bar of an edition.
 * Priority: Baixar PDF (primary) > Visualizar PDF > Verificar autenticidade
 *           > Compartilhar > Imprimir > Copiar link.
 * Uses navigator.share when available; otherwise copies the link and shows
 * accessible feedback. Mobile wraps without horizontal overflow.
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
        // fall through to clipboard
      }
    }
    await copyText(url);
  };

  const handleCopy = () => {
    copyText(pageUrl || downloadUrl);
  };

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

  const icon = (name: string) => (
    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
      {name}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary font-bold rounded-lg hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
        >
          {icon("download")}
          <span className="text-label-md">Baixar PDF</span>
        </a>
      )}
      {viewUrl && (
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded-lg hover:bg-surface-container-highest"
        >
          {icon("visibility")}
          <span className="text-label-md">Visualizar PDF</span>
        </a>
      )}
      {verificationUrl && (
        <Link
          href={verificationUrl}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded-lg hover:bg-surface-container-highest"
        >
          {icon("verified_user")}
          <span className="text-label-md">Verificar autenticidade</span>
        </Link>
      )}
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded-lg hover:bg-surface-container-highest"
      >
        {icon("share")}
        <span className="text-label-md">{shared ? "Compartilhado!" : "Compartilhar"}</span>
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded-lg hover:bg-surface-container-highest"
      >
        {icon("print")}
        <span className="text-label-md">Imprimir</span>
      </button>
      <button
        type="button"
        onClick={handleCopy}
        aria-live="polite"
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded-lg hover:bg-surface-container-highest"
      >
        {icon(copied ? "check" : "link")}
        <span className="text-label-md">{copied ? "Link copiado." : "Copiar link"}</span>
      </button>
    </div>
  );
}
