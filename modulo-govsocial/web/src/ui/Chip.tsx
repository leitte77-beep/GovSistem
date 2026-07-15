import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Chip com TEXTO sempre presente — informação nunca só por cor (§7).
 * As cores de evento apontam para os tokens semânticos.
 */
export type CorChip =
  | "neutro"
  | "primario"
  | "amber"
  | "danger"
  | "sensitive"
  | "paif"
  | "scfv"
  | "paefi"
  | "mse"
  | "beneficio"
  | "encaminhamento"
  | "visita";

const CORES: Record<CorChip, { fundo: string; texto: string; borda: string }> = {
  neutro: { fundo: "bg-ink-soft/10", texto: "text-ink", borda: "border-ink-soft/20" },
  primario: { fundo: "bg-primary-soft", texto: "text-primary", borda: "border-primary/20" },
  amber: { fundo: "bg-amber/10", texto: "text-amber", borda: "border-amber/30" },
  danger: { fundo: "bg-danger/10", texto: "text-danger", borda: "border-danger/30" },
  sensitive: { fundo: "bg-sensitive/10", texto: "text-sensitive", borda: "border-sensitive/30" },
  paif: { fundo: "bg-evt-paif/10", texto: "text-evt-paif", borda: "border-evt-paif/30" },
  scfv: { fundo: "bg-evt-scfv/10", texto: "text-evt-scfv", borda: "border-evt-scfv/30" },
  paefi: { fundo: "bg-evt-paefi/10", texto: "text-evt-paefi", borda: "border-evt-paefi/30" },
  mse: { fundo: "bg-evt-mse/10", texto: "text-evt-mse", borda: "border-evt-mse/30" },
  beneficio: {
    fundo: "bg-evt-beneficio/10",
    texto: "text-evt-beneficio",
    borda: "border-evt-beneficio/30",
  },
  encaminhamento: {
    fundo: "bg-evt-encaminhamento/10",
    texto: "text-evt-encaminhamento",
    borda: "border-evt-encaminhamento/30",
  },
  visita: { fundo: "bg-evt-visita/10", texto: "text-evt-visita", borda: "border-evt-visita/30" },
};

export function Chip({
  cor = "neutro",
  icone,
  children,
  className,
}: {
  cor?: CorChip;
  icone?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const c = CORES[cor];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        c.fundo,
        c.texto,
        c.borda,
        className,
      )}
    >
      {icone}
      {children}
    </span>
  );
}
