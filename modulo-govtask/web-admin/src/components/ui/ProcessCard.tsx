"use client";

import Link from "next/link";
import { FileText, ListChecks, Clock, Star } from "lucide-react";
import { SituacaoPill } from "./SituacaoPill";
import { PriorityBadge } from "./PriorityBadge";
import {
  CATEGORIA_RECURSO_LABELS,
  TIPO_CONVENIO_LABELS,
  SITUACAO_PROCESSO_LABELS,
  cn,
  formatCurrency,
  formatDate,
  pct,
  pctLabel,
} from "@/lib/utils";
import type { ConvenioListItem } from "@/types/govtask";

type ProcessCardProps = {
  c: ConvenioListItem;
  favorito?: boolean;
  onToggleFavorito?: (id: string, favorito: boolean) => void;
  className?: string;
};

function tipoLabel(c: ConvenioListItem): string {
  if (c.categoria) return CATEGORIA_RECURSO_LABELS[c.categoria] || c.categoria;
  return TIPO_CONVENIO_LABELS[c.tipo] || c.tipo;
}

function ProgressRow({ label, value, color }: { label: string; value: number | string | null | undefined; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-[#667085]">{label}</span>
        <span className="text-[12px] text-[#475467] tabular-nums">{pctLabel(value)}%</span>
      </div>
      <div className="h-1.5 bg-[#F2F4F7] rounded-pill overflow-hidden">
        <div className={cn("h-full rounded-pill transition-all duration-700", color)} style={{ width: `${pct(value)}%` }} />
      </div>
    </div>
  );
}

/** Card de processo — usado no dashboard e na listagem de processos. */
export function ProcessCard({ c, favorito, onToggleFavorito, className }: ProcessCardProps) {
  const identificador = c.numero_emenda || c.numero_protocolo_governo;
  const etapa = c.etapa_atual || (c.situacao ? SITUACAO_PROCESSO_LABELS[c.situacao] || c.situacao : "");

  return (
    <div
      className={cn(
        "relative bg-white border border-[#E4E7EC] rounded-xl p-5 flex flex-col transition-all duration-200 hover:shadow-elevated hover:border-[#D0D5DD]",
        className
      )}
    >
      {onToggleFavorito && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorito(c.id, !favorito);
          }}
          className="absolute top-4 right-4 z-10 text-[#D0D5DD] hover:text-[#F5A524] transition-colors"
          aria-label={favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          <Star className={cn("w-[18px] h-[18px]", favorito && "fill-[#F5A524] text-[#F5A524]")} />
        </button>
      )}

      <Link href={`/convenios/${c.id}`} className="flex flex-col flex-1 group">
        <div className="flex items-center gap-1.5 pr-7 text-[12px]">
          <span className="text-[#667085]">{tipoLabel(c)}</span>
          {identificador && <span className="text-[#98A2B3] truncate">· {identificador}</span>}
        </div>

        <h3 className="text-[15px] font-semibold text-[#101828] mt-1 leading-snug truncate group-hover:text-[#1D4ED8] transition-colors">
          {c.titulo}
        </h3>

        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <SituacaoPill situacao={c.situacao} status={c.status} />
          {c.prioridade && <PriorityBadge priority={c.prioridade} />}
        </div>

        <p className="text-[15px] font-semibold text-[#101828] tabular-nums mt-3">{formatCurrency(c.valor)}</p>

        <div className="space-y-2.5 mt-3">
          <ProgressRow label="Físico" value={c.percentual_fisico} color="bg-[#2E90FA]" />
          <ProgressRow label="Financeiro" value={c.percentual_financeiro} color="bg-[#12B76A]" />
        </div>

        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[#F2F4F7] text-[12px] text-[#667085] min-w-0">
          <span className="flex items-center gap-1 shrink-0" title="Tarefas abertas">
            <ListChecks className="w-3.5 h-3.5" />
            <span className="tabular-nums">{c.tarefas_abertas ?? 0}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0" title="Pendências">
            <FileText className="w-3.5 h-3.5" />
            <span className="tabular-nums">{c.pendencias ?? 0}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0" title="Próximo prazo">
            <Clock className="w-3.5 h-3.5" />
            <span className="tabular-nums">{c.proximo_prazo ? formatDate(c.proximo_prazo) : "—"}</span>
          </span>
          {etapa && <span className="truncate ml-auto text-right">{etapa}</span>}
        </div>
      </Link>
    </div>
  );
}
