import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UnidadeResumo } from "@/tipos/api";

/**
 * Contexto global de unidade (§3): a escolha define agenda, fila, RMA etc.
 * A preferência é persistida por usuário/tenant no localStorage.
 */
const CHAVE = "govsocial.unidade_atual";

type UnidadeContexto = {
  unidades: UnidadeResumo[];
  unidadeAtual: UnidadeResumo | null;
  definirUnidade: (id: string) => void;
  carregando: boolean;
};

const Contexto = createContext<UnidadeContexto | null>(null);

export function UnidadeAtualProvider({
  unidades,
  carregando = false,
  children,
}: {
  unidades: UnidadeResumo[];
  carregando?: boolean;
  children: ReactNode;
}) {
  const [atualId, setAtualId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(CHAVE),
  );

  // Se o id persistido não existir mais nas unidades, escolhe a primeira ativa.
  useEffect(() => {
    if (unidades.length === 0) return;
    const existe = atualId && unidades.some((u) => u.id === atualId);
    if (!existe) {
      const primeira = unidades.find((u) => u.is_active) ?? unidades[0];
      setAtualId(primeira.id);
    }
  }, [unidades, atualId]);

  useEffect(() => {
    if (atualId) localStorage.setItem(CHAVE, atualId);
  }, [atualId]);

  const definirUnidade = useCallback((id: string) => setAtualId(id), []);

  const valor = useMemo<UnidadeContexto>(() => {
    const unidadeAtual = unidades.find((u) => u.id === atualId) ?? null;
    return { unidades, unidadeAtual, definirUnidade, carregando };
  }, [unidades, atualId, definirUnidade, carregando]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useUnidadeAtual(): UnidadeContexto {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useUnidadeAtual requer UnidadeAtualProvider");
  return ctx;
}
