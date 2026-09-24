"use client";

/**
 * Tempo real. Uma única conexão SSE por aba (`/eventos`), compartilhada por
 * todas as telas. Quando um pedido muda, as telas inscritas recarregam o que
 * mostram — ninguém precisa apertar F5 para ver o Jurídico devolver.
 *
 * Se a conexão cair, o navegador reconecta sozinho (retry do SSE). Enquanto
 * estiver fora, `conectado` fica falso e a topbar mostra "reconectando".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { obterToken } from "@/lib/api";

export interface PedidoAlterado {
  id: string;
  numero: string;
  titulo: string | null;
  situacao: string;
  setor_atual: string | null;
}

type Ouvinte = (pedidos: PedidoAlterado[]) => void;

interface TempoReal {
  conectado: boolean;
  naoLidas: number;
  inscrever: (fn: Ouvinte) => () => void;
}

const Ctx = createContext<TempoReal>({
  conectado: false,
  naoLidas: 0,
  inscrever: () => () => {},
});

export function TempoRealProvider({ children }: { children: React.ReactNode }) {
  const [conectado, setConectado] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const ouvintes = useRef(new Set<Ouvinte>());

  useEffect(() => {
    let fonte: EventSource | null = null;
    let tentativa: ReturnType<typeof setTimeout> | undefined;
    let vivo = true;

    function abrir() {
      const token = obterToken();
      if (!token || !vivo) return;
      fonte = new EventSource(`/api/govtask/eventos?token=${encodeURIComponent(token)}`);
      fonte.addEventListener("conectado", () => setConectado(true));
      fonte.addEventListener("pedidos", (e) => {
        try {
          const { pedidos } = JSON.parse((e as MessageEvent).data);
          ouvintes.current.forEach((fn) => fn(pedidos));
        } catch {
          /* evento malformado: ignora */
        }
      });
      fonte.addEventListener("notificacoes", (e) => {
        try {
          setNaoLidas(JSON.parse((e as MessageEvent).data).nao_lidas ?? 0);
        } catch {
          /* ignora */
        }
      });
      fonte.addEventListener("expirado", () => {
        fonte?.close();
        setConectado(false);
      });
      fonte.onerror = () => {
        setConectado(false);
        // Erro de autenticação fecha a fonte; tenta de novo com calma.
        if (fonte?.readyState === EventSource.CLOSED) {
          tentativa = setTimeout(abrir, 15000);
        }
      };
    }

    abrir();
    return () => {
      vivo = false;
      clearTimeout(tentativa);
      fonte?.close();
    };
  }, []);

  const inscrever = useCallback((fn: Ouvinte) => {
    ouvintes.current.add(fn);
    return () => {
      ouvintes.current.delete(fn);
    };
  }, []);

  return (
    <Ctx.Provider value={{ conectado, naoLidas, inscrever }}>{children}</Ctx.Provider>
  );
}

export function useTempoReal() {
  return useContext(Ctx);
}

/**
 * Chama `recarregar` quando algum pedido mudar (ou só os de `filtro`).
 * Agrupa rajadas: várias mudanças em sequência viram uma recarga só.
 */
export function useAoMudar(
  recarregar: (pedidos: PedidoAlterado[]) => void,
  filtro?: (p: PedidoAlterado) => boolean
) {
  const { inscrever } = useTempoReal();
  const fn = useRef(recarregar);
  const filtroRef = useRef(filtro);
  fn.current = recarregar;
  filtroRef.current = filtro;

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    let acumulado: PedidoAlterado[] = [];
    const sair = inscrever((pedidos) => {
      const relevantes = filtroRef.current ? pedidos.filter(filtroRef.current) : pedidos;
      if (relevantes.length === 0) return;
      acumulado = acumulado.concat(relevantes);
      clearTimeout(espera);
      espera = setTimeout(() => {
        fn.current(acumulado);
        acumulado = [];
      }, 400);
    });
    return () => {
      clearTimeout(espera);
      sair();
    };
  }, [inscrever]);
}
