import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";

/**
 * Cartão de indicador do dashboard (§4.9) — número grande em Archivo, com
 * rótulo. Quando `para` é informado, o cartão inteiro é um link para o relatório
 * correspondente (mantendo o alvo de toque e o foco visível).
 */
export function CartaoIndicador({
  rotulo,
  valor,
  detalhe,
  icone,
  para,
  destaque,
}: {
  rotulo: string;
  valor: number | string;
  detalhe?: string;
  icone?: ReactNode;
  para?: string;
  destaque?: "amber";
}) {
  const conteudo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-soft">{rotulo}</span>
        {icone && <span className="text-ink-soft">{icone}</span>}
      </div>
      <p
        className={clsx(
          "mt-2 font-titulo text-2xl tabular-nums",
          destaque === "amber" ? "text-amber" : "text-ink",
        )}
      >
        {valor}
      </p>
      {detalhe && <p className="mt-1 text-xs text-ink-soft">{detalhe}</p>}
    </>
  );

  const classe =
    "block rounded-cartao border border-ink-soft/15 bg-surface p-5 shadow-um";

  if (para) {
    return (
      <Link
        to={para}
        className={clsx(
          classe,
          "transition-colors hover:border-primary focus-visible:outline-focus",
        )}
      >
        {conteudo}
      </Link>
    );
  }

  return <div className={classe}>{conteudo}</div>;
}
