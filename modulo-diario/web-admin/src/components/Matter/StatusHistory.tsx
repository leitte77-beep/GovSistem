"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { AuditEvent } from "@/types/matter";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import StatusBadge, { getStatusLabel } from "./StatusBadge";
import type { MatterStatus } from "@/types/matter";

interface StatusHistoryProps {
  matterId: string;
}

const ACTION_LABELS_PT: Record<string, string> = {
  "matter.created": "Matéria criada",
  "matter.updated": "Matéria atualizada",
  "matter.status_changed": "Status alterado",
  "matter.deleted": "Matéria excluída",
};

function describeEvent(event: AuditEvent): string {
  const meta = (event.extra_metadata ?? {}) as { from?: string; to?: string };
  const base = ACTION_LABELS_PT[event.action] || event.action;
  if (event.action === "matter.status_changed") {
    const from = meta.from ? getStatusLabel(meta.from as MatterStatus) : null;
    const to = meta.to ? getStatusLabel(meta.to as MatterStatus) : null;
    if (from && to) return `${from} → ${to}`;
    if (to) return `Alterado para ${to}`;
  }
  return base;
}

export default function StatusHistory({ matterId }: StatusHistoryProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listMatterAudit(matterId)
      .then(setEvents)
      .catch((err) => notifyError("StatusHistory", err))
      .finally(() => setLoading(false));
  }, [matterId]);

  if (loading) return <div className="text-body-sm text-on-surface-variant">Carregando...</div>;
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-body-md font-semibold text-on-surface">
        <Clock size={14} aria-hidden="true" /> Histórico
      </h4>
      <div className="relative space-y-3 border-l-2 border-outline-variant pl-4">
        {events.map((evt) => {
          const meta = evt.extra_metadata as { from?: string; to?: string } | null;
          const fromLabel = meta?.from ? getStatusLabel(meta.from as MatterStatus) : null;
          const toLabel = meta?.to ? getStatusLabel(meta.to as MatterStatus) : null;

          return (
            <div key={evt.id} className="relative text-body-sm">
              <div className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary-fixed-dim" />
              <p className="text-on-surface-variant">{new Date(evt.created_at).toLocaleString("pt-BR")}</p>
              <p className="text-on-surface">{describeEvent(evt)}</p>
              {fromLabel && toLabel && (
                <div className="mt-1 flex items-center gap-1.5">
                  <StatusBadge status={meta!.from as MatterStatus} size="sm" />
                  <span className="text-outline" aria-hidden="true">→</span>
                  <StatusBadge status={meta!.to as MatterStatus} size="sm" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
