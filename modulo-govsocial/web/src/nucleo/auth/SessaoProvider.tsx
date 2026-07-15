import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ClaimsJwt, Papel, UsuarioMe } from "@/tipos/api";
import { http } from "@/nucleo/http/clienteHttp";
import { bootstrapTokenDaShell, lerAccessToken } from "./tokenStorage";
import { decodificarClaims, tokenExpirado } from "./jwt";

export type EstadoSessao = "carregando" | "autenticado" | "nao_autenticado";

export type Sessao = {
  estado: EstadoSessao;
  claims: ClaimsJwt | null;
  usuario: UsuarioMe | null;
  papeis: Papel[];
  tenantId: string | null;
  /** Lotações do usuário (unit_ids) quando técnico — vêm de /auth/me. */
  lotacoes: string[];
};

const inicial: Sessao = {
  estado: "carregando",
  claims: null,
  usuario: null,
  papeis: [],
  tenantId: null,
  lotacoes: [],
};

const Contexto = createContext<Sessao>(inicial);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao>(inicial);

  useEffect(() => {
    let vivo = true;

    async function carregar() {
      bootstrapTokenDaShell();
      const token = lerAccessToken();
      const claims = token ? decodificarClaims(token) : null;

      if (!token || !claims || tokenExpirado(claims)) {
        if (vivo) setSessao({ ...inicial, estado: "nao_autenticado" });
        return;
      }

      // O JWT não traz nome nem lotações — completa via /auth/me.
      try {
        const me = await http.get<UsuarioMe>("/auth/me");
        // lotações podem vir em /auth/me em fases futuras; hoje derivamos vazio
        // e as telas técnicas resolvem via profissionais quando necessário.
        const lotacoes = Array.isArray(
          (me as unknown as { lotacoes?: string[] }).lotacoes,
        )
          ? (me as unknown as { lotacoes: string[] }).lotacoes
          : [];
        if (vivo) {
          setSessao({
            estado: "autenticado",
            claims,
            usuario: me,
            papeis: (me.roles?.map((r) => r.name) as Papel[]) ?? claims.roles,
            tenantId: me.organization_id ?? claims.organization_id,
            lotacoes,
          });
        }
      } catch {
        // Sem /auth/me, ainda seguimos com as claims do token (degradação).
        if (vivo) {
          setSessao({
            estado: "autenticado",
            claims,
            usuario: null,
            papeis: claims.roles,
            tenantId: claims.organization_id,
            lotacoes: [],
          });
        }
      }
    }

    void carregar();
    return () => {
      vivo = false;
    };
  }, []);

  const valor = useMemo(() => sessao, [sessao]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  return useContext(Contexto);
}
