import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { EstadoSemPermissao } from "@/ui";
import { Loader2 } from "lucide-react";

export function GuardRota({ exige, children }: { exige?: string; children: ReactNode }) {
  const { estado, permissoes } = useSessao();

  if (estado === "carregando") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (estado === "nao_autenticado") {
    return <Navigate to="/entrar" replace />;
  }

  if (exige && !permissoes.has(exige)) {
    return <EstadoSemPermissao />;
  }

  return <>{children}</>;
}
