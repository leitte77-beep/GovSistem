import { useId, useRef, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Abas acessíveis (ARIA tablist) com navegação por setas. As abas sem permissão
 * simplesmente não são passadas na lista (não renderizam) — §1.1.
 */
export type Aba = {
  id: string;
  rotulo: string;
  conteudo: ReactNode;
};

export function Abas({
  abas,
  ativa,
  aoMudar,
  rotulo,
}: {
  abas: Aba[];
  ativa: string;
  aoMudar: (id: string) => void;
  rotulo: string;
}) {
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function aoTeclar(e: React.KeyboardEvent, indice: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const proximo = (indice + dir + abas.length) % abas.length;
    const id = abas[proximo].id;
    aoMudar(id);
    refs.current[id]?.focus();
  }

  const abaAtiva = abas.find((a) => a.id === ativa) ?? abas[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label={rotulo}
        className="flex flex-wrap -mb-px gap-6 border-b border-surface-container-highest"
      >
        {abas.map((aba, i) => {
          const selecionada = aba.id === ativa;
          return (
            <button
              key={aba.id}
              ref={(el) => (refs.current[aba.id] = el)}
              role="tab"
              id={`${baseId}-tab-${aba.id}`}
              aria-selected={selecionada}
              aria-controls={`${baseId}-panel-${aba.id}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => aoMudar(aba.id)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={clsx(
                "min-h-[44px] border-b-2 px-xs py-sm font-label-md text-label-md transition-colors focus-visible:outline-focus",
                selecionada
                  ? "border-primary text-primary"
                  : "border-transparent text-secondary hover:text-primary",
              )}
            >
              {aba.rotulo}
            </button>
          );
        })}
      </div>
      {abaAtiva && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${abaAtiva.id}`}
          aria-labelledby={`${baseId}-tab-${abaAtiva.id}`}
          tabIndex={0}
          className="pt-md focus-visible:outline-focus"
        >
          {abaAtiva.conteudo}
        </div>
      )}
    </div>
  );
}
