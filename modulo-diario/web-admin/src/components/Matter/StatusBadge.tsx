"use client";

import type { MatterStatus } from "@/types/matter";
import clsx from "clsx";
import { Clock, Eye, CheckCircle, Globe, Archive, XCircle } from "lucide-react";

const STATUS_LABELS: Record<MatterStatus, string> = {
  draft: "Rascunho",
  review: "Em Revisão",
  approved: "Aprovado",
  published: "Publicado",
  archived: "Arquivado",
  rejected: "Rejeitado",
};

const STATUS_ICONS: Record<MatterStatus, React.ComponentType<any>> = {
  draft: Clock,
  review: Eye,
  approved: CheckCircle,
  published: Globe,
  archived: Archive,
  rejected: XCircle,
};

const STATUS_COLORS: Record<MatterStatus, string> = {
  draft: "bg-surface-container-high text-on-surface-variant",
  review: "bg-status-review-bg text-status-review-text",
  approved: "bg-secondary-container text-on-secondary-container",
  published: "bg-secondary text-on-secondary",
  archived: "bg-surface-container-high text-on-surface-variant",
  rejected: "bg-error-container text-on-error-container",
};

interface StatusBadgeProps {
  status: MatterStatus | string;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const knownStatus = status as MatterStatus;
  const Icon = STATUS_ICONS[knownStatus] || Clock;
  const label = STATUS_LABELS[knownStatus] || String(status);
  const color = STATUS_COLORS[knownStatus] || "bg-surface-container-high text-on-surface-variant";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        color,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      )}
    >
      <Icon size={size === "sm" ? 12 : 14} aria-hidden="true" />
      {label}
    </span>
  );
}

export function getStatusLabel(status: MatterStatus | string): string {
  return STATUS_LABELS[status as MatterStatus] || String(status);
}
