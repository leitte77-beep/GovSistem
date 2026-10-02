"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Car, Download, X, ZoomIn } from "lucide-react";

interface FotoVeiculoProps {
  src: string | null | undefined;
  alt?: string;
  /** Classes do container da imagem (ex.: dimensões). */
  className?: string;
  /** Clicar abre a foto em tamanho grande. */
  ampliavel?: boolean;
}

const ACCESS_TOKEN_KEY = "govfrota_access_token";

/**
 * Exibe a foto do veículo. Como o download exige Bearer token (o <img> comum
 * não envia o header), busca a imagem com o token e a converte em objectURL.
 * Sem foto, mostra um ícone neutro.
 */
export function FotoVeiculo({ src, alt = "Foto do veículo", className, ampliavel }: FotoVeiculoProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelado = false;
    if (!src) {
      setUrl(null);
      setFalhou(false);
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => {
        if (!r.ok) throw new Error("falha");
        return r.blob();
      })
      .then((blob) => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setFalhou(false);
      })
      .catch(() => {
        if (!cancelado) setFalhou(true);
      });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!url || falhou) {
    return (
      <div className={`flex items-center justify-center bg-surface-bg text-text-subtle ${className ?? ""}`}>
        <Car size={18} />
      </div>
    );
  }
  const img = <img src={url} alt={alt} className={`object-cover ${className ?? ""}`} />;
  if (!ampliavel) return img;
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} title="Ampliar foto" aria-label="Ampliar foto do veículo"
        className="group relative block h-full w-full cursor-zoom-in">
        {img}
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
          <ZoomIn size={22} />
        </span>
      </button>
      {aberta && <Ampliada url={url} alt={alt} onFechar={() => setAberta(false)} />}
    </>
  );
}

function Ampliada({ url, alt, onFechar }: { url: string; alt: string; onFechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = overflow; };
  }, [onFechar]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt} onClick={onFechar}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 sm:p-10">
      <div className="absolute right-4 top-4 flex gap-2">
        <a href={url} download="foto-veiculo.jpg" onClick={(e) => e.stopPropagation()} title="Baixar"
          className="rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/25"><Download size={20} /></a>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/25"><X size={20} /></button>
      </div>
      <img src={url} alt={alt} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
    </div>,
    document.body,
  );
}
