"use client";

import { useState } from "react";

/**
 * Copies a stable deep-link (canonical anchor) to a specific matter.
 * Uses the current page URL + the matter's stable anchor id.
 */
export default function CopyMatterLink({ anchorId, label }: { anchorId: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const base = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
    const url = `${base}#${anchorId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-md text-[12px] font-semibold text-edition-muted no-print transition-colors hover:text-[var(--edition-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)]"
      title="Copiar link para esta matéria"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
        {copied ? "check" : "link"}
      </span>
      {copied ? "Link copiado." : label || "Copiar link"}
    </button>
  );
}
