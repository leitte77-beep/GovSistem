"use client";

/**
 * Setores da prefeitura, carregados uma vez e compartilhados.
 *
 * Antes os nomes eram fixos no front; agora vêm do cadastro do módulo, então
 * o que o município criar aparece nas telas sem deploy.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api, type Setor } from "@/lib/api";

interface ContextoSetores {
  setores: Setor[];
  nomes: Record<string, string>;
  recarregar: () => Promise<void>;
}

const Ctx = createContext<ContextoSetores>({
  setores: [],
  nomes: {},
  recarregar: async () => {},
});

export function SetoresProvider({ children }: { children: React.ReactNode }) {
  const [setores, setSetores] = useState<Setor[]>([]);

  const recarregar = useCallback(async () => {
    try {
      setSetores(await api.setores());
    } catch {
      setSetores([]);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const nomes = Object.fromEntries(setores.map((s) => [s.codigo, s.nome]));

  return (
    <Ctx.Provider value={{ setores, nomes, recarregar }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSetores() {
  return useContext(Ctx);
}

/** Nome de um código de setor; cai no próprio código se ainda não carregou. */
export function useNomeSetor() {
  const { nomes } = useSetores();
  return (codigo: string | null | undefined) =>
    codigo ? nomes[codigo] ?? codigo : "";
}
