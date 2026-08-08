import { useMemo } from "react";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import {
  capacidadesDe,
  itensDeMenuDe,
  type Capacidade,
  type ItemMenu,
} from "@/nucleo/permissoes/matrizPapeis";

/**
 * Hook de capacidade: true se algum papel da sessão tem a capacidade.
 * A UI esconde ações (UX); a autorização efetiva é decidida no backend.
 */
export function usePermissao(capacidade: Capacidade): boolean {
  const { papeis } = useSessao();
  return useMemo(
    () => capacidadesDe(papeis).has(capacidade),
    [papeis, capacidade],
  );
}

/**
 * Hook agregado para a Sidebar: conjunto de capacidades e itens de menu
 * do usuário logado (papéis vêm da sessão, matriz em matrizPapeis.ts).
 */
export function usePermissoes() {
  const { papeis } = useSessao();
  return useMemo(
    () => ({
      tem: (capacidade: Capacidade) => capacidadesDe(papeis).has(capacidade),
      temAlgum: (capacidades: Capacidade[]) =>
        capacidades.some((c) => capacidadesDe(papeis).has(c)),
      itensMenu: itensDeMenuDe(papeis) as Set<ItemMenu>,
    }),
    [papeis],
  );
}
