"use client";

import { useEffect, useState } from "react";
import { Car } from "lucide-react";

const DRIVER_TOKEN_KEY = "govfrota_motorista_token";

interface Props {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  iconSize?: number;
}

/** Foto do veículo no app do motorista — busca com o token driver_access. */
export function FotoMotorista({ src, alt = "Foto do veículo", className, iconSize = 20 }: Props) {
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
    const token = localStorage.getItem(DRIVER_TOKEN_KEY);
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
      <div className={`flex items-center justify-center bg-[#EFF4FF] text-[#424750] ${className ?? ""}`}>
        <Car size={iconSize} />
      </div>
    );
  }
  return <img src={url} alt={alt} className={`object-cover ${className ?? ""}`} />;
}
