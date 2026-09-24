"use client";

import { useEffect, useState } from "react";
import { Car } from "lucide-react";

interface FotoVeiculoProps {
  src: string | null | undefined;
  alt?: string;
  /** Classes do container da imagem (ex.: dimensões). */
  className?: string;
}

const ACCESS_TOKEN_KEY = "govfrota_access_token";

/**
 * Exibe a foto do veículo. Como o download exige Bearer token (o <img> comum
 * não envia o header), busca a imagem com o token e a converte em objectURL.
 * Sem foto, mostra um ícone neutro.
 */
export function FotoVeiculo({ src, alt = "Foto do veículo", className }: FotoVeiculoProps) {
  const [url, setUrl] = useState<string | null>(null);
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
  return <img src={url} alt={alt} className={`object-cover ${className ?? ""}`} />;
}
