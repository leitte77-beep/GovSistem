import { useEffect, useState } from "react";

/** Atrasa a propagação de um valor (debounce). Usado na busca (300ms). */
export function useDebounce<T>(valor: T, ms = 300): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return debounced;
}
