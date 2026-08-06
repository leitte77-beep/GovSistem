import { Lock } from "lucide-react";
import clsx from "clsx";

/**
 * Ícone de cadeado com nome acessível — base visual do <CartaoSigiloso>
 * (implementado na Fase 3). O roxo do sigilo é o token --ga-sensitive.
 */
export function Cadeado({
  rotulo = "Conteúdo restrito",
  className,
}: {
  rotulo?: string;
  className?: string;
}) {
  return (
    <span className={clsx("inline-flex text-sensitive", className)} role="img" aria-label={rotulo}>
      <Lock aria-hidden className="h-4 w-4" />
    </span>
  );
}
