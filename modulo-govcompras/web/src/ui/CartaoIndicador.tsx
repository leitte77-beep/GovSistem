import type { ReactNode } from "react";
import clsx from "clsx";
import { Link } from "react-router-dom";

interface CartaoIndicadorProps {
  rotulo: string;
  valor: ReactNode;
  icone?: ReactNode;
  destaque?: "neutro" | "atencao" | "critico" | "sucesso";
  link?: string;
  subtitulo?: string;
}

const DESTAQUES = {
  neutro: "text-slate-900",
  atencao: "text-amber-600",
  critico: "text-red-600",
  sucesso: "text-emerald-600",
};

export function CartaoIndicador({ rotulo, valor, icone, destaque = "neutro", link, subtitulo }: CartaoIndicadorProps) {
  const conteudo = (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] transition-shadow hover:shadow-md">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{rotulo}</p>
        <p className={clsx("mt-1.5 text-2xl font-semibold tabular-nums", DESTAQUES[destaque])}>{valor}</p>
        {subtitulo && <p className="mt-1 text-xs text-slate-400">{subtitulo}</p>}
      </div>
      {icone && <div className="shrink-0 rounded-lg bg-slate-50 p-2 text-slate-400">{icone}</div>}
    </div>
  );

  if (link) {
    return (
      <Link to={link} className="block">
        {conteudo}
      </Link>
    );
  }
  return conteudo;
}
