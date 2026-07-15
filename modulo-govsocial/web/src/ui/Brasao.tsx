import { useState } from "react";
import { Landmark } from "lucide-react";
import clsx from "clsx";

/**
 * Brasão do tenant no cabeçalho e capas. Se a URL falhar ou não existir,
 * cai num ícone institucional neutro (marca do produto).
 */
export function Brasao({
  url,
  alt,
  className,
}: {
  url: string | null;
  alt: string;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);

  if (!url || falhou) {
    return (
      <span
        className={clsx("inline-flex items-center justify-center text-primary", className)}
        role="img"
        aria-label={alt}
      >
        <Landmark aria-hidden className="h-7 w-7" />
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={clsx("h-7 w-7 object-contain", className)}
      onError={() => setFalhou(true)}
    />
  );
}
