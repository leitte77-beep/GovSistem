import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { corDestaqueAprovada } from "./contraste";

/**
 * Tematização por tenant (§2): brasão no topo/capas e cor de destaque do
 * município aplicada SOMENTE em decoração. A cor só é usada se passar na
 * verificação de contraste contra o texto que ficará sobre a barra; senão,
 * mantém o padrão do produto (--ga-primary). Ações e textos nunca mudam.
 */
export type TenantTema = {
  nomeMunicipio: string;
  brasaoUrl: string | null;
  corDestaque: string | null; // hex do município (opcional)
};

const PADRAO: TenantTema = {
  nomeMunicipio: "Município",
  brasaoUrl: null,
  corDestaque: null,
};

const Contexto = createContext<TenantTema>(PADRAO);

export function TenantTemaProvider({
  tema,
  children,
}: {
  tema: TenantTema;
  children: ReactNode;
}) {
  // Texto que fica sobre a barra decorativa é branco.
  const textoSobreBarra = "#FFFFFF";
  const usarCorTenant = corDestaqueAprovada(tema.corDestaque, textoSobreBarra);

  useEffect(() => {
    const raiz = document.documentElement;
    if (usarCorTenant && tema.corDestaque) {
      raiz.style.setProperty("--ga-brand-bar", tema.corDestaque);
      raiz.style.setProperty("--ga-brand-bar-ink", textoSobreBarra);
    } else {
      // Reverte ao padrão do produto (não vaza cor reprovada).
      raiz.style.removeProperty("--ga-brand-bar");
      raiz.style.removeProperty("--ga-brand-bar-ink");
    }
  }, [usarCorTenant, tema.corDestaque]);

  const valor = useMemo(() => tema, [tema]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTenantTema(): TenantTema {
  return useContext(Contexto);
}
