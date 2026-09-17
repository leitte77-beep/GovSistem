"use client";

import { cn, situacaoColor, situacaoLabel } from "@/lib/utils";

type SituacaoPillProps = {
  situacao?: string | null;
  status?: string | null;
  className?: string;
};

/**
 * Pill da situação do processo (Em execução, Em diligência, Em licitação...).
 * Cai para o status do convênio quando o processo ainda não tem situação.
 */
export function SituacaoPill({ situacao, status, className }: SituacaoPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-medium whitespace-nowrap",
        situacaoColor(situacao, status),
        className
      )}
    >
      {situacaoLabel(situacao, status)}
    </span>
  );
}
