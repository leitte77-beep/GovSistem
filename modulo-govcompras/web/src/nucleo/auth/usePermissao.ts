import { useSessao } from "./SessaoProvider";

/** `usePermissao("govcompras.processos.avancar")` — a interface só esconde
 * o botão; a API sempre repete a checagem (nunca é a única barreira). */
export function usePermissao(chave: string): boolean {
  const { permissoes } = useSessao();
  return permissoes.has(chave);
}

export function usePermissoes(chaves: string[]): boolean {
  const { permissoes } = useSessao();
  return chaves.some((chave) => permissoes.has(chave));
}
