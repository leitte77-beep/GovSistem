"use client";

import { useEffect, useState } from "react";
import { iniciais } from "@/lib/motoristas";

const ACCESS_TOKEN_KEY = "govfrota_access_token";

interface Props {
  src: string | null | undefined;
  nome: string;
  className?: string;
}

/** Avatar do motorista: foto (busca com token) ou iniciais neutras. */
export function AvatarMotorista({ src, nome, className = "h-10 w-10 text-sm" }: Props) {
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

  if (url && !falhou) {
    return <img src={url} alt={`Foto de ${nome}`} className={`flex-shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <div className={`flex flex-shrink-0 items-center justify-center rounded-full bg-[#D9E2FF] font-bold text-[#1D5BD6] ${className}`}>
      {iniciais(nome)}
    </div>
  );
}
