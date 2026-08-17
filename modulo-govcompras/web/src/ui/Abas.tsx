import clsx from "clsx";

export interface AbaItem {
  chave: string;
  rotulo: string;
  contagem?: number;
}

export function Abas({
  itens,
  ativa,
  aoSelecionar,
}: {
  itens: AbaItem[];
  ativa: string;
  aoSelecionar: (chave: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {itens.map((item) => (
        <button
          key={item.chave}
          onClick={() => aoSelecionar(item.chave)}
          className={clsx(
            "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            ativa === item.chave
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {item.rotulo}
          {item.contagem !== undefined && (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
              {item.contagem}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
