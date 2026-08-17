import { useEffect, useState, type ReactNode } from "react";
import { http } from "@/nucleo/http/clienteHttp";
import type { UnidadeResumo } from "@/tipos/api";
import { UnidadeAtualProvider } from "@/contextos/UnidadeAtualProvider";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { normalizarNomeUnidade } from "@/nucleo/formatoTexto";

/**
 * Carrega as unidades do tenant (contexto global) e alimenta o provider.
 * Só busca após a sessão estar autenticada.
 */
export function CarregadorUnidades({ children }: { children: ReactNode }) {
  const { estado } = useSessao();
  const [unidades, setUnidades] = useState<UnidadeResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (estado !== "autenticado") return;
    let vivo = true;
    setCarregando(true);
    http
      .get<UnidadeResumo[]>("/units")
      .then((us) => {
        if (vivo)
          setUnidades(
            us
              .filter((u) => u.is_active)
              .map((u) => ({ ...u, nome: normalizarNomeUnidade(u.nome) })),
          );
      })
      .catch(() => {
        if (vivo) setUnidades([]);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [estado]);

  return (
    <UnidadeAtualProvider unidades={unidades} carregando={carregando}>
      {children}
    </UnidadeAtualProvider>
  );
}
