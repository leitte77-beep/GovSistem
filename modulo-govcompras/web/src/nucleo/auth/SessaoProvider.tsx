import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, registrarAoDeslogar } from "@/nucleo/http/clienteHttp";
import { definirToken, limparToken, obterToken } from "./tokenStorage";
import type { UsuarioAtual } from "@/nucleo/tipos";

type EstadoSessao = "carregando" | "autenticado" | "nao_autenticado";

interface SessaoContextValor {
  estado: EstadoSessao;
  usuario: UsuarioAtual | null;
  permissoes: Set<string>;
  entrarComToken: (token: string) => Promise<void>;
  sair: () => void;
  recarregar: () => Promise<void>;
}

const SessaoContext = createContext<SessaoContextValor | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSessao>("carregando");
  const [usuario, setUsuario] = useState<UsuarioAtual | null>(null);

  const carregarUsuario = useCallback(async () => {
    try {
      const dados = await api.get<UsuarioAtual>("/auth/me");
      setUsuario(dados);
      setEstado("autenticado");
    } catch {
      limparToken();
      setUsuario(null);
      setEstado("nao_autenticado");
    }
  }, []);

  useEffect(() => {
    registrarAoDeslogar(() => {
      setUsuario(null);
      setEstado("nao_autenticado");
    });

    const urlAtual = new URL(window.location.href);
    const tokenDaUrl = urlAtual.searchParams.get("token");
    if (tokenDaUrl) {
      definirToken(tokenDaUrl);
      urlAtual.searchParams.delete("token");
      window.history.replaceState({}, "", urlAtual.pathname + urlAtual.search);
    }

    if (obterToken()) {
      void carregarUsuario();
    } else {
      setEstado("nao_autenticado");
    }
  }, [carregarUsuario]);

  const entrarComToken = useCallback(
    async (token: string) => {
      definirToken(token);
      setEstado("carregando");
      await carregarUsuario();
    },
    [carregarUsuario],
  );

  const sair = useCallback(() => {
    limparToken();
    setUsuario(null);
    setEstado("nao_autenticado");
  }, []);

  const permissoes = useMemo(() => new Set(usuario?.permissoes ?? []), [usuario]);

  const valor = useMemo<SessaoContextValor>(
    () => ({ estado, usuario, permissoes, entrarComToken, sair, recarregar: carregarUsuario }),
    [estado, usuario, permissoes, entrarComToken, sair, carregarUsuario],
  );

  return <SessaoContext.Provider value={valor}>{children}</SessaoContext.Provider>;
}

export function useSessao(): SessaoContextValor {
  const contexto = useContext(SessaoContext);
  if (!contexto) throw new Error("useSessao precisa estar dentro de <SessaoProvider>");
  return contexto;
}
