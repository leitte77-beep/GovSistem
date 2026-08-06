import { Outlet } from "react-router-dom";
import { Brasao } from "@/ui/Brasao";
import { useTenantTema } from "@/tema/TenantTemaProvider";

/**
 * Layout de impressão A4 (§ rotas /imprimir): sem shell, com capa contendo o
 * brasão do tenant. As telas de prontuário/comprovante/RMA espelho (fases
 * seguintes) renderizam dentro deste layout. A barra de destaque só aparece
 * na tela; no @media print o CSS remove elementos .nao-imprimir.
 */
export function LayoutImpressao() {
  const tema = useTenantTema();
  return (
    <div className="mx-auto min-h-screen max-w-[210mm] bg-white p-8 text-ink">
      <header
        className="mb-6 flex items-center gap-3 border-b-4 pb-3"
        style={{ borderColor: "var(--ga-brand-bar)" }}
      >
        <Brasao url={tema.brasaoUrl} alt={`Brasão de ${tema.nomeMunicipio}`} />
        <div className="leading-tight">
          <strong className="block font-titulo">{tema.nomeMunicipio}</strong>
          <span className="text-xs text-ink-soft">Assistência Social · GovSocial</span>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
