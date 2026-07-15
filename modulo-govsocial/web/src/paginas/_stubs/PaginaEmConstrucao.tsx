import type { ReactNode } from "react";
import { Construction } from "lucide-react";
import { textos } from "@/i18n/textos";

/**
 * Stub das rotas de negócio (Fases 2+). Já prova o layout, o guard e a
 * navegação. As telas reais substituem este componente nas próximas fases,
 * cada uma com os 5 estados projetados (§11).
 */
export function PaginaEmConstrucao({
  titulo,
  fase,
  children,
}: {
  titulo: string;
  fase: string;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="titulo-pagina" className="space-y-4">
      <h1 id="titulo-pagina" className="text-xl">
        {titulo}
      </h1>
      <div className="flex items-start gap-3 rounded-cartao border border-ink-soft/15 bg-surface p-6 shadow-um">
        <Construction className="h-6 w-6 shrink-0 text-amber" aria-hidden />
        <div>
          <h2 className="text-base">{textos.estados.emConstrucaoTitulo}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {textos.estados.emConstrucaoDescricao} ({fase})
          </p>
          {children}
        </div>
      </div>
    </section>
  );
}
