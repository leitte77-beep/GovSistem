import { QueryClient } from "@tanstack/react-query";
import { ErroApi } from "@/nucleo/http/problemDetails";

/**
 * TanStack Query configurado para o contexto de prefeitura:
 * - staleTime curto no geral; fila/agenda usarão staleTime ainda menor (por query).
 * - Não repetir automaticamente mutações (evita efeito duplicado — §14).
 * - Não repetir GET em 4xx (erro do cliente); só a camada http faz retry de rede/5xx.
 * - Nenhum cache é persistido em disco (conteúdo sensível nunca sai da sessão — §1.2).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (contagem, erro) => {
        if (erro instanceof ErroApi && erro.problema.status >= 400 && erro.problema.status < 500) {
          return false;
        }
        return contagem < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
