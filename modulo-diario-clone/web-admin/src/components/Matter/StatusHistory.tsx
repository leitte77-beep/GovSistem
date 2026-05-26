"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { AuditEvent } from "@/types/matter";
import { api } from "@/lib/api";
import StatusBadge, { getStatusLabel } from "./StatusBadge";
import type { MatterStatus } from "@/types/matter";

interface StatusHistoryProps {
  matterId: string;
}

function extractStatusFromAction(action: string): MatterStatus | null {
  const map: Record<string, MatterStatus | null> = {
    "matter.created": "draft",
    "matter.status_changed": null,
  };
  return map[action] ?? null;
}

export default function StatusHistory({ matterId }: StatusHistoryProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listMatterAudit(matterId)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [matterId]);

  if (loading) return <div className="text-sm text-gray-400">Carregando...</div>;
  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-600 flex items-center gap-1">
        <Clock size={14} /> Histórico
      </h4>
      <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
        {events.map((evt) => {
          const meta = evt.extra_metadata as { from?: string; to?: string } | null;
          const fromLabel = meta?.from ? getStatusLabel(meta.from as MatterStatus) : null;
          const toLabel = meta?.to ? getStatusLabel(meta.to as MatterStatus) : null;

          return (
            <div key={evt.id} className="text-xs">
              <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-gray-300" />
              <p className="text-gray-500">{new Date(evt.created_at).toLocaleString("pt-BR")}</p>
              <p className="text-gray-700">{evt.description}</p>
              {fromLabel && toLabel && (
                <div className="flex items-center gap-1 mt-0.5">
                  <StatusBadge status={meta!.from as MatterStatus} size="sm" />
                  <span className="text-gray-400">→</span>
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
