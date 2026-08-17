import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

type Variante = "primario" | "secundario" | "perigo" | "fantasma";
type Tamanho = "sm" | "md";

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
  icone?: ReactNode;
}

const VARIANTES: Record<Variante, string> = {
  primario: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-900/10",
  secundario: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  perigo: "bg-red-600 text-white hover:bg-red-700",
  fantasma: "bg-transparent text-slate-600 hover:bg-slate-100",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "text-xs px-2.5 py-1.5 gap-1.5",
  md: "text-sm px-3.5 py-2 gap-2",
};

export function Botao({
  variante = "primario",
  tamanho = "md",
  carregando = false,
  icone,
  className,
  children,
  disabled,
  ...props
}: BotaoProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      disabled={disabled || carregando}
      {...props}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" /> : icone}
      {children}
    </button>
  );
}
