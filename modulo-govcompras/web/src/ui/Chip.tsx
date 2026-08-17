import type { ReactNode } from "react";
import clsx from "clsx";

export type CorChip = "neutro" | "azul" | "verde" | "amarelo" | "laranja" | "vermelho" | "roxo";

const CORES: Record<CorChip, string> = {
  neutro: "bg-slate-100 text-slate-700 ring-slate-200",
  azul: "bg-blue-50 text-blue-700 ring-blue-200",
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amarelo: "bg-amber-50 text-amber-800 ring-amber-200",
  laranja: "bg-orange-50 text-orange-700 ring-orange-200",
  vermelho: "bg-red-50 text-red-700 ring-red-200",
  roxo: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Chip({
  cor = "neutro",
  children,
  icone,
  className,
}: {
  cor?: CorChip;
  children: ReactNode;
  icone?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        CORES[cor],
        className,
      )}
    >
      {icone}
      {children}
    </span>
  );
}

const CORES_SLA: Record<string, CorChip> = {
  dentro_do_prazo: "verde",
  atencao: "amarelo",
  atrasado: "laranja",
  critico: "vermelho",
};

const ROTULOS_SLA: Record<string, string> = {
  dentro_do_prazo: "Dentro do prazo",
  atencao: "Atenção",
  atrasado: "Atrasado",
  critico: "Crítico",
};

export function ChipSLA({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <Chip cor={CORES_SLA[status] ?? "neutro"}>{ROTULOS_SLA[status] ?? status}</Chip>;
}

const CORES_STATUS_GERAL: Record<string, CorChip> = {
  em_andamento: "azul",
  concluido: "verde",
  cancelado: "vermelho",
  suspenso: "amarelo",
  vigente: "verde",
  encerrado: "neutro",
  rescindido: "vermelho",
};

const ROTULOS_STATUS_GERAL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  suspenso: "Suspenso",
  vigente: "Vigente",
  encerrado: "Encerrado",
  rescindido: "Rescindido",
};

export function ChipStatus({ status }: { status: string }) {
  return (
    <Chip cor={CORES_STATUS_GERAL[status] ?? "neutro"}>{ROTULOS_STATUS_GERAL[status] ?? status}</Chip>
  );
}
