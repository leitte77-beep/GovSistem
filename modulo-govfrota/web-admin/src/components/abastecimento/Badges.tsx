"use client";

import { AlertTriangle } from "lucide-react";
import { origemInfo, rotuloAlerta, statusInfo } from "@/lib/abastecimentos";

export function BadgeStatus({ status }: { status: string | null | undefined }) {
  const info = statusInfo(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border bg-success-vibrant/10 px-2.5 py-1 text-[11px] font-bold ${info.classe}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.cor}`} />
      {info.rotulo}
    </span>
  );
}

export function BadgeOrigem({ origem }: { origem: string | null | undefined }) {
  const info = origemInfo(origem);
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${info.classe}`}>
      {info.rotulo}
    </span>
  );
}

/** Selo de conferência: aparece quando o registro disparou algum alerta. */
export function BadgeAlertas({ alertas, completo = false }: { alertas?: string[] | null; completo?: boolean }) {
  if (!alertas || alertas.length === 0) return null;
  const texto = alertas.map(rotuloAlerta).join(" · ");
  return (
    <span
      title={texto}
      className="inline-flex items-center gap-1 rounded-md bg-[#FFF4D6] px-2 py-0.5 text-[11px] font-bold text-[#7A4F00]"
    >
      <AlertTriangle size={12} />
      {completo ? texto : alertas.length === 1 ? rotuloAlerta(alertas[0]) : `${alertas.length} alertas`}
    </span>
  );
}
