import { useEffect, type ReactNode } from "react";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { usePermissoes } from "@/nucleo/permissoes/usePermissao";
import type { Capacidade } from "@/nucleo/permissoes/matrizPapeis";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { Skeleton } from "@/ui/Skeleton";

// Plataforma SaaS: quando não há sessão SSO, o usuário volta para lá para
// abrir o módulo pelo card (que injeta o token via ?token=).
const PLATAFORMA_URL =
  import.meta.env.VITE_PLATFORM_URL || "https://admin.govsistem.com.br/";

/**
 * Guarda de rota (§1.1): sem a capacidade exigida, mostra a página
 * institucional de "sem acesso" — nunca o conteúdo protegido.
 */
export function GuardRota({
  exige,
  children,
}: {
  exige?: Capacidade;
  children: ReactNode;
}) {
  const { estado } = useSessao();
  const { tem } = usePermissoes();

  // Sem sessão SSO (acesso direto pela URL, token ausente/expirado):
  // redireciona para a plataforma em vez de deixar o usuário num beco sem saída.
  useEffect(() => {
    if (estado === "nao_autenticado") {
      const t = setTimeout(() => {
        window.location.href = PLATAFORMA_URL;
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [estado]);

  if (estado === "carregando") {
    return (
      <div className="p-6">
        <Skeleton variante="cartao" />
      </div>
    );
  }

  if (estado === "nao_autenticado") {
    return (
      <EstadoSemPermissao
        mensagem="Sua sessão não está ativa. Redirecionando para a plataforma GovSistem para você abrir o módulo…"
        acao={{ rotulo: "Ir para a plataforma agora", href: PLATAFORMA_URL }}
      />
    );
  }

  if (exige && !tem(exige)) {
    return <EstadoSemPermissao />;
  }

  return <>{children}</>;
}
