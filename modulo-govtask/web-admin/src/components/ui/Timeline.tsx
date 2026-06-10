"use client";

import { relativeTime, cn } from "@/lib/utils";
import type { TimelineEvent } from "@/types/govtask";
import {
  FileText,
  CheckCircle,
  Send,
  RotateCcw,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  Clock,
  Pause,
  Play,
  XCircle,
  UserPlus,
} from "lucide-react";

type TimelineProps = {
  events: TimelineEvent[];
  loading?: boolean;
  tipos?: string[];
  onFilterChange?: (tipos: string[]) => void;
  className?: string;
};

const TIPO_LABELS: Record<string, string> = {
  CONVENIO_CRIADO: "Convênio criado",
  ETAPA_CRIADA: "Etapa criada",
  ETAPA_CONCLUIDA: "Etapa concluída",
  ETAPA_INICIADA: "Etapa iniciada",
  ENCAMINHADO_GOVERNO: "Encaminhado ao governo",
  RESPOSTA_GOVERNO: "Resposta do governo",
  TAREFA_CRIADA: "Tarefa criada",
  TAREFA_ACEITA: "Tarefa aceita",
  TAREFA_ENTREGUE: "Tarefa entregue",
  TAREFA_DEVOLVIDA: "Tarefa devolvida",
  TAREFA_CONCLUIDA: "Tarefa concluída",
  TAREFA_CANCELADA: "Tarefa cancelada",
  CONTESTACAO_ABERTA: "Contestação aberta",
  CONTESTACAO_DECIDIDA: "Contestação decidida",
  COMENTARIO: "Comentário adicionado",
  ANEXO_UPLOAD: "Anexo enviado",
  CONVENIO_SUSPENSO: "Convênio suspenso",
  CONVENIO_REATIVADO: "Convênio reativado",
  CONVENIO_CANCELADO: "Convênio cancelado",
  RESPONSAVEL_ALTERADO: "Responsável alterado",
  PRAZO_PROXIMO: "Prazo próximo",
  PRAZO_VENCIDO: "Prazo vencido",
};

const TIPO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CONVENIO_CRIADO: FileText,
  ETAPA_INICIADA: Play,
  ETAPA_CONCLUIDA: CheckCircle,
  ENCAMINHADO_GOVERNO: Send,
  RESPOSTA_GOVERNO: RotateCcw,
  TAREFA_CRIADA: FileText,
  TAREFA_ACEITA: CheckCircle,
  TAREFA_ENTREGUE: CheckCircle,
  TAREFA_DEVOLVIDA: RotateCcw,
  TAREFA_CONCLUIDA: CheckCircle,
  TAREFA_CANCELADA: XCircle,
  CONTESTACAO_ABERTA: AlertTriangle,
  CONTESTACAO_DECIDIDA: CheckCircle,
  COMENTARIO: MessageSquare,
  ANEXO_UPLOAD: Paperclip,
  CONVENIO_SUSPENSO: Pause,
  CONVENIO_REATIVADO: Play,
  CONVENIO_CANCELADO: XCircle,
  RESPONSAVEL_ALTERADO: UserPlus,
  PRAZO_PROXIMO: Clock,
  PRAZO_VENCIDO: AlertTriangle,
};

const EVENT_TYPES = [
  "CONVENIO_CRIADO",
  "TAREFA_CRIADA",
  "TAREFA_ENTREGUE",
  "TAREFA_DEVOLVIDA",
  "TAREFA_CONCLUIDA",
  "CONTESTACAO_ABERTA",
  "CONTESTACAO_DECIDIDA",
  "COMENTARIO",
  "ANEXO_UPLOAD",
  "ENCAMINHADO_GOVERNO",
  "RESPOSTA_GOVERNO",
  "ETAPA_CONCLUIDA",
];

export function Timeline({ events, loading, tipos, onFilterChange, className }: TimelineProps) {
  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="skeleton w-8 h-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const activeTipos = tipos || EVENT_TYPES;

  const filtered = events.filter((e) => activeTipos.includes(e.tipo_evento));

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8 text-text-subtle text-body-sm">
        Nenhum evento registrado
      </div>
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      {onFilterChange && (
        <div className="flex flex-wrap gap-1 mb-4">
          {EVENT_TYPES.map((tipo) => {
            const active = activeTipos.includes(tipo);
            return (
              <button
                key={tipo}
                onClick={() => {
                  if (active) {
                    onFilterChange(activeTipos.filter((t) => t !== tipo));
                  } else {
                    onFilterChange([...activeTipos, tipo]);
                  }
                }}
                className={cn(
                  "px-2 py-1 text-meta rounded-pill border transition-colors",
                  active
                    ? "bg-[#1D4ED8]/10 text-[#1D4ED8] border-[#1D4ED8]/30"
                    : "bg-white text-text-subtle border-surface-border hover:border-text-subtle"
                )}
              >
                {TIPO_LABELS[tipo] || tipo}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative pl-8">
        {filtered.map((event, i) => {
          const IconComponent = TIPO_ICONS[event.tipo_evento] || FileText;
          const isLast = i === filtered.length - 1;

          return (
            <div key={event.id} className="relative pb-6">
              {!isLast && (
                <div className="absolute left-[-1.65rem] top-8 bottom-0 w-0.5 bg-[#E4E7EC]" />
              )}

              <div className="absolute left-[-2rem] bg-white p-0.5 rounded-full">
                <IconComponent className="w-4 h-4 text-[#1D4ED8]" />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-label text-text-title">
                    {TIPO_LABELS[event.tipo_evento] || event.tipo_evento}
                  </span>
                  {event.ator && (
                    <span className="text-body-sm text-text-body">
                      por <span className="font-medium text-text-title">{event.ator.name}</span>
                    </span>
                  )}
                  <span className="text-meta text-text-subtle">{relativeTime(event.ocorrido_em)}</span>
                </div>

                <p className="text-body-sm text-text-body mt-1">{event.descricao}</p>

                {event.metadados && (
                  <div className="mt-2">
                    {(event.metadados as Record<string, string>).before && (event.metadados as Record<string, string>).after && (
                      <div className="flex items-center gap-2 text-meta">
                        <span className="text-[#B42318] line-through">
                          {String((event.metadados as Record<string, string>).before)}
                        </span>
                        <span className="text-text-subtle">→</span>
                        <span className="text-[#067647]">{String((event.metadados as Record<string, string>).after)}</span>
                      </div>
                    )}
                    {(event.metadados as Record<string, string>).motivo && (
                      <p className="text-meta text-text-subtle mt-1">
                        Motivo: {String((event.metadados as Record<string, string>).motivo)}
                      </p>
                    )}
                    {(event.metadados as Record<string, string>).nome_arquivo && (
                      <p className="text-meta text-text-subtle mt-1">
                        Arquivo: {String((event.metadados as Record<string, string>).nome_arquivo)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
