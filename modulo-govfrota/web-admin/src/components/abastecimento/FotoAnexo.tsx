"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { getAccessToken } from "@/lib/api";

const ACCESS_TOKEN_KEY = "govfrota_access_token";

function useFotoToken(url: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelado = false;
    if (!url) {
      setSrc(null);
      setFalhou(false);
      return;
    }
    setFalhou(false);
    const token = getAccessToken() || localStorage.getItem(ACCESS_TOKEN_KEY);
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => {
        if (!r.ok) throw new Error("falha");
        return r.blob();
      })
      .then((blob) => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelado) setFalhou(true);
      });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { src, falhou };
}

/** Thumbnail de anexo/foto do abastecimento. Clique abre visualização maior. */
export function FotoAnexo({ url, alt, className }: { url?: string | null; alt: string; className?: string }) {
  const { src, falhou } = useFotoToken(url);
  const [aberto, setAberto] = useState(false);

  if (!url || falhou) {
    return (
      <div className={`flex items-center justify-center rounded-card border border-dashed border-surface-border bg-surface-bg text-text-subtle ${className ?? "h-24 w-32"}`}>
        <ImageOff size={20} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`overflow-hidden rounded-card border border-surface-border bg-surface-bg transition-transform hover:scale-[1.02] ${className ?? "h-24 w-32"}`}
        aria-label={`Ampliar ${alt}`}
      >
        <img src={src ?? undefined} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setAberto(false)}>
          <img src={src ?? undefined} alt={alt} className="max-h-full max-w-full rounded-card shadow-elevated" onClick={(e) => e.stopPropagation()} />
          <button className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white" onClick={() => setAberto(false)} aria-label="Fechar">✕</button>
        </div>
      )}
    </>
  );
}
