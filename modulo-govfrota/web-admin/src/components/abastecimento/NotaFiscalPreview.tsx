"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getAccessToken } from "@/lib/api";

export type TipoNota = "xml" | "pdf";

/**
 * Visualiza a nota fiscal (PDF/XML) em um modal, sem baixar o arquivo.
 * O download exige Bearer token (o Content-Disposition vem como attachment),
 * então o arquivo é buscado autenticado e renderizado localmente.
 */
export function NotaFiscalPreview({
  url,
  tipo,
  titulo,
  onClose,
}: {
  url: string;
  tipo: TipoNota;
  titulo?: string;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelado = false;
    const token = getAccessToken();
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (r) => {
        if (!r.ok) throw new Error("falha");
        if (tipo === "pdf") {
          const blob = await r.blob();
          if (cancelado) return;
          objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
          setSrc(objectUrl);
        } else {
          const t = await r.text();
          if (!cancelado) setTexto(t);
        }
      })
      .catch(() => {
        if (!cancelado) setErro(true);
      });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, tipo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tituloFinal = titulo ?? (tipo === "pdf" ? "Nota fiscal (PDF)" : "Nota fiscal (XML)");

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={tituloFinal}
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <span className="text-body-sm font-semibold text-text-title">{tituloFinal}</span>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-text-subtle transition-colors hover:bg-surface-bg hover:text-text-title"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-surface-bg">
          {erro && <p className="p-6 text-body-sm text-text-subtle">Não foi possível carregar o documento.</p>}
          {tipo === "pdf" && !erro && !src && (
            <div className="flex h-full items-center justify-center text-text-subtle"><Loader2 className="animate-spin" /></div>
          )}
          {tipo === "pdf" && src && <iframe src={src} title={tituloFinal} className="h-full w-full" />}
          {tipo === "xml" && !erro && texto == null && (
            <div className="flex h-full items-center justify-center text-text-subtle"><Loader2 className="animate-spin" /></div>
          )}
          {tipo === "xml" && texto != null && (
            <pre className="h-full overflow-auto p-4 text-meta leading-relaxed text-text-body">{texto}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
