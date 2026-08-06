import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Densidade = "confortavel" | "compacto";

const CHAVE = "govsocial.densidade";

type DensidadeContexto = {
  densidade: Densidade;
  alternar: () => void;
  definir: (d: Densidade) => void;
};

const Contexto = createContext<DensidadeContexto | null>(null);

function ler(): Densidade {
  if (typeof window === "undefined") return "confortavel";
  return localStorage.getItem(CHAVE) === "compacto" ? "compacto" : "confortavel";
}

export function DensidadeProvider({ children }: { children: ReactNode }) {
  const [densidade, setDensidade] = useState<Densidade>(ler);

  // Aplica no <html> para os tokens CSS reagirem (data-densidade).
  useEffect(() => {
    document.documentElement.dataset.densidade = densidade;
    localStorage.setItem(CHAVE, densidade);
  }, [densidade]);

  const alternar = useCallback(
    () => setDensidade((d) => (d === "compacto" ? "confortavel" : "compacto")),
    [],
  );

  const valor = useMemo(
    () => ({ densidade, alternar, definir: setDensidade }),
    [densidade, alternar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDensidade(): DensidadeContexto {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useDensidade deve ser usado dentro de DensidadeProvider");
  return ctx;
}
