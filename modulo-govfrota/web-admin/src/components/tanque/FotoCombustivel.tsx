"use client";

import { useEffect, useState } from "react";
import { Fuel } from "lucide-react";
import { getAccessToken } from "@/lib/api";

/**
 * Imagem autenticada (envia Authorization) com fallback elegante.
 *
 * As imagens do GovFrota são servidas pela API autenticada, então um `<img>`
 * comum não funciona (não envia o header). Este componente busca o blob com o
 * token e o exibe via objectURL. Quando não há imagem, mostra um placeholder
 * com o ícone informado — nunca quebra o layout.
 */
export function FotoCombustivel({
  src,
  alt,
  className,
  iconClassName,
  fallback,
  rounded = "rounded-btn",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  fallback?: React.ReactNode;
  rounded?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!src) {
      setObjectUrl(null);
      setErro(false);
      return;
    }
    let revogar: string | null = null;
    let ativo = true;
    const token = getAccessToken();
    fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => {
        if (!r.ok) throw new Error("falha");
        return r.blob();
      })
      .then((blob) => {
        if (!ativo) return;
        revogar = URL.createObjectURL(blob);
        setObjectUrl(revogar);
      })
      .catch(() => {
        if (ativo) setErro(true);
      });
    return () => {
      ativo = false;
      if (revogar) URL.revokeObjectURL(revogar);
    };
  }, [src]);

  const mostrarImagem = src && !erro && objectUrl;

  if (mostrarImagem) {
    return <img src={objectUrl!} alt={alt} loading="lazy" className={className} />;
  }
  return (
    <div className={`flex items-center justify-center bg-surface-bg text-text-subtle ${rounded} ${className ?? ""}`}>
      {fallback ?? <Fuel className={iconClassName ?? "h-8 w-8"} />}
    </div>
  );
}
