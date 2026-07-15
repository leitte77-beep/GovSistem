import { useMemo } from "react";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import {
  capacidadesDe,
  itensDeMenuDe,
  type Capacidade,
  type ItemMenu,
} from "./matrizPapeis";

/**
 * Hook de permissão dirigida por claims (§6 do plano técnico).
 * Uso: const podeConceder = usePermissao("beneficio.conceder");
 */
export function usePermissao(capacidade: Capacidade): boolean {
  const { papeis } = useSessao();
  return useMemo(() => capacidadesDe(papeis).has(capacidade), [papeis, capacidade]);
}

export function usePermissoes(): {
  tem: (c: Capacidade) => boolean;
  temAlgum: (cs: Capacidade[]) => boolean;
  itensMenu: Set<ItemMenu>;
} {
  const { papeis } = useSessao();
  return useMemo(() => {
    const caps = capacidadesDe(papeis);
    return {
      tem: (c: Capacidade) => caps.has(c),
      temAlgum: (cs: Capacidade[]) => cs.some((c) => caps.has(c)),
      itensMenu: itensDeMenuDe(papeis),
    };
  }, [papeis]);
}
