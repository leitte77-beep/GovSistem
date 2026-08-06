import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/nucleo/query/queryClient";
import { SessaoProvider } from "@/nucleo/auth/SessaoProvider";
import { CarregadorUnidades } from "@/contextos/CarregadorUnidades";
import { SincronizacaoProvider } from "@/nucleo/offline/SincronizacaoProvider";
import { TenantTemaProvider } from "@/tema/TenantTemaProvider";
import { DensidadeProvider } from "@/tema/densidade";
import { ProvedorToast } from "@/ui/Toast";
import { Rotas } from "@/rotas";
import { useOrganizationConfig } from "@/nucleo/api/hooks";
import type { TenantTema } from "@/tema/TenantTemaProvider";

// Prefixo de rota. Embutido na shell: "/assistencia-social". Standalone
// (subdomínio próprio): "/". Deriva do base do Vite (VITE_BASE_PATH).
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

function TemaDoTenant({ children }: { children: React.ReactNode }) {
  const { data } = useOrganizationConfig();

  const tema: TenantTema = {
    nomeMunicipio: data?.nome_municipio ?? "Município",
    brasaoUrl: data?.brasao_url ?? null,
    corDestaque: data?.cor_destaque ?? null,
  };

  return <TenantTemaProvider tema={tema}>{children}</TenantTemaProvider>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DensidadeProvider>
        <TemaDoTenant>
          <BrowserRouter basename={BASENAME}>
            <SessaoProvider>
              <CarregadorUnidades>
                <SincronizacaoProvider>
                  <Rotas />
                </SincronizacaoProvider>
              </CarregadorUnidades>
            </SessaoProvider>
          </BrowserRouter>
          <ProvedorToast />
        </TemaDoTenant>
      </DensidadeProvider>
    </QueryClientProvider>
  );
}
