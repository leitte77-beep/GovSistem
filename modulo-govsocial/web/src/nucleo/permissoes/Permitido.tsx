import type { ReactNode } from "react";
import type { Capacidade } from "./matrizPapeis";
import { usePermissoes } from "./usePermissao";

/**
 * Renderiza a subárvore SOMENTE se o usuário tiver a capacidade.
 * Remove o elemento do DOM (não desabilita) — §1.1. Sem capacidade e sem
 * fallback, nada é renderizado (nem ocupa espaço, nem vaza existência).
 */
export function Permitido({
  capacidade,
  algum,
  fallback = null,
  children,
}: {
  capacidade?: Capacidade;
  algum?: Capacidade[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { tem, temAlgum } = usePermissoes();
  const autorizado = capacidade
    ? tem(capacidade)
    : algum
      ? temAlgum(algum)
      : true;

  if (!autorizado) return <>{fallback}</>;
  return <>{children}</>;
}
