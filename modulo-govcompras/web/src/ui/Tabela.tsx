import type { ReactNode } from "react";
import clsx from "clsx";

export interface ColunaTabela<T> {
  chave: string;
  cabecalho: string;
  renderizar: (item: T) => ReactNode;
  className?: string;
}

interface TabelaProps<T> {
  colunas: ColunaTabela<T>[];
  itens: T[];
  chavePorItem: (item: T) => string;
  aoClicarLinha?: (item: T) => void;
  vazio?: ReactNode;
  carregando?: boolean;
}

export function Tabela<T>({ colunas, itens, chavePorItem, aoClicarLinha, vazio, carregando }: TabelaProps<T>) {
  if (carregando) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (itens.length === 0) {
    return <div className="p-8">{vazio}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
            {colunas.map((coluna) => (
              <th key={coluna.chave} className={clsx("px-4 py-2.5 font-medium", coluna.className)}>
                {coluna.cabecalho}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr
              key={chavePorItem(item)}
              onClick={() => aoClicarLinha?.(item)}
              className={clsx(
                "border-b border-slate-100 last:border-0",
                aoClicarLinha && "cursor-pointer hover:bg-slate-50",
              )}
            >
              {colunas.map((coluna) => (
                <td key={coluna.chave} className={clsx("px-4 py-3 align-middle", coluna.className)}>
                  {coluna.renderizar(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
