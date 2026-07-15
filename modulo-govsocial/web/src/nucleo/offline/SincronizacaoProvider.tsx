import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useEstadoConexao } from "./estadoConexao";
import { contarPendentes } from "./filaSync";
import { sincronizarFila } from "./processarFila";

/**
 * Coordena a fila de sincronização (§9): expõe o número de pendentes para a
 * <BarraOffline> e dispara o envio automaticamente ao reconectar.
 */
type SyncContexto = {
  pendentes: number;
  atualizarPendentes: () => Promise<void>;
  sincronizarAgora: () => Promise<void>;
};

const Contexto = createContext<SyncContexto | null>(null);

export function SincronizacaoProvider({ children }: { children: ReactNode }) {
  const { online } = useEstadoConexao();
  const [pendentes, setPendentes] = useState(0);
  const jaOnline = useRef(online);

  const atualizarPendentes = useCallback(async () => {
    setPendentes(await contarPendentes());
  }, []);

  const sincronizarAgora = useCallback(async () => {
    await sincronizarFila();
    await atualizarPendentes();
  }, [atualizarPendentes]);

  // Conta pendentes ao montar.
  useEffect(() => {
    void atualizarPendentes();
  }, [atualizarPendentes]);

  // Ao voltar a conexão, sincroniza.
  useEffect(() => {
    if (online && !jaOnline.current) {
      void sincronizarAgora();
    }
    jaOnline.current = online;
  }, [online, sincronizarAgora]);

  const valor = useMemo(
    () => ({ pendentes, atualizarPendentes, sincronizarAgora }),
    [pendentes, atualizarPendentes, sincronizarAgora],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSincronizacao(): SyncContexto {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useSincronizacao requer SincronizacaoProvider");
  return ctx;
}
