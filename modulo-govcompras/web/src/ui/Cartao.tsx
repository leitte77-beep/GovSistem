import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export function Cartao({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CartaoCabecalho({
  titulo,
  descricao,
  acoes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function CartaoCorpo({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("p-5", className)}>{children}</div>;
}
