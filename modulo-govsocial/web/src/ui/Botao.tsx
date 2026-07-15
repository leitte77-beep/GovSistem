import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

type Variante = "primario" | "secundario" | "perigo" | "texto";
type Tamanho = "md" | "sm";

export type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
  iconeInicio?: ReactNode;
  iconeFim?: ReactNode;
  /** Impede duplo submit em mutações críticas (§14). */
  bloqueiaDuploSubmit?: boolean;
};

const VARIANTES: Record<Variante, string> = {
  primario:
    "bg-primary text-white hover:brightness-110 disabled:opacity-60 border border-transparent",
  secundario:
    "bg-surface text-ink border border-ink-soft/30 hover:border-primary hover:text-primary disabled:opacity-60",
  perigo:
    "bg-danger text-white hover:brightness-110 disabled:opacity-60 border border-transparent",
  texto: "bg-transparent text-primary hover:underline disabled:opacity-60 border border-transparent",
};

const TAMANHOS: Record<Tamanho, string> = {
  md: "text-sm px-4 min-h-[44px]",
  sm: "text-sm px-3 min-h-[36px]",
};

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    variante = "primario",
    tamanho = "md",
    carregando = false,
    bloqueiaDuploSubmit = false,
    iconeInicio,
    iconeFim,
    children,
    className,
    disabled,
    onClick,
    type = "button",
    ...resto
  },
  ref,
) {
  const [enviando, setEnviando] = useState(false);
  const inativo = disabled || carregando || (bloqueiaDuploSubmit && enviando);

  async function aoClicar(e: React.MouseEvent<HTMLButtonElement>) {
    if (!onClick) return;
    if (bloqueiaDuploSubmit) {
      setEnviando(true);
      try {
        await onClick(e);
      } finally {
        setEnviando(false);
      }
    } else {
      onClick(e);
    }
  }

  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-input font-corpo font-semibold",
        "transition-[filter,border-color,color] focus-visible:outline-focus",
        "disabled:cursor-not-allowed",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      disabled={inativo}
      aria-busy={carregando || enviando}
      onClick={aoClicar}
      {...resto}
    >
      {(carregando || enviando) && (
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
      )}
      {!carregando && !enviando && iconeInicio}
      <span>{children}</span>
      {iconeFim}
    </button>
  );
});
