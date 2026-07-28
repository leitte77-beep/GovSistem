import { useMemo } from "react";
export function usePermissoes() {
  return useMemo(() => ({
    tem: (_: string) => true,
    temAlgum: (_: string[]) => true,
    itensMenu: new Set<string>(),
  }), []);
}
