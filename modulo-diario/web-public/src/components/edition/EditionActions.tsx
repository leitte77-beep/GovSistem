"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type EditionActionsProps = {
  downloadUrl: string;
  viewUrl: string;
  verificationUrl?: string;
  verificationCode?: string;
  shareTitle: string;
};

/**
 * Action row with real hierarchy: only "Baixar PDF" is primary. Visualizar
 * and Compartilhar stay visible as quiet text actions; everything else lives
 * in an overflow "⋯ Mais" menu so no more than a couple of affordances ever
 * compete with the document.
 */
export default function EditionActions({
  downloadUrl,
  viewUrl,
  verificationUrl,
  shareTitle,
}: EditionActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    setTimeout(() => setCopied(false), 2400);
  };

  const handleShare = async () => {
    const url = pageUrl || downloadUrl;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url });
        setShared(true);
        setTimeout(() => setShared(false), 2400);
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    await copyText(url);
  };

  const handleCopy = async () => {
    await copyText(pageUrl || downloadUrl);
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const icon = (name: string, size = "20px") => (
    <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: size }}>
      {name}
    </span>
  );

  const ghost =
    "inline-flex h-10 items-center gap-2 rounded-xl border border-transparent bg-slate-50 px-3.5 text-sm font-semibold text-slate-600 transition-all hover:border-brand-100 hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent";

  const menuItem =
    "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-edition-ink transition-colors hover:bg-slate-50 hover:text-brand-900";

  return (
    <div className="flex flex-wrap items-center gap-1.5 no-print sm:gap-2">
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(15,42,82,0.18)] transition hover:-translate-y-px hover:bg-brand-800 hover:shadow-[0_7px_18px_rgba(15,42,82,0.24)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent sm:px-5"
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
          className={ghost}
        >
          {icon("visibility")}
          <span className="hidden sm:inline">Visualizar PDF</span>
        </a>
      )}

      <button type="button" onClick={handleShare} className={ghost}>
        {icon(shared ? "check" : "share")}
        <span className="hidden sm:inline">{shared ? "Compartilhado!" : "Compartilhar"}</span>
      </button>

      {/* overflow menu */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Mais ações"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-transparent bg-slate-50 text-slate-600 transition-colors hover:border-brand-100 hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          {icon("more_horiz", "22px")}
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Mais ações da edição"
            className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg"
          >
            {verificationUrl && (
              <Link
                href={verificationUrl}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={menuItem}
              >
                {icon("verified_user", "18px")}
                Verificar autenticidade
              </Link>
            )}
            <button type="button" role="menuitem" onClick={() => window.print()} className={menuItem}>
              {icon("print", "18px")}
              Imprimir
            </button>
            <button
              type="button"
              role="menuitem"
              aria-live="polite"
              onClick={handleCopy}
              className={menuItem}
            >
              {icon(copied ? "check" : "link", "18px")}
              {copied ? "Link copiado." : "Copiar link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
