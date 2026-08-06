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
  draft: "bg-gray-100 text-gray-700",
  review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  published: "bg-blue-100 text-blue-800",
  archived: "bg-gray-200 text-gray-600",
  rejected: "bg-red-100 text-red-800",
};

interface StatusBadgeProps {
  status: MatterStatus | string;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const knownStatus = status as MatterStatus;
  const Icon = STATUS_ICONS[knownStatus] || Clock;
  const label = STATUS_LABELS[knownStatus] || String(status);
  const color = STATUS_COLORS[knownStatus] || "bg-gray-100 text-gray-700";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 font-medium rounded-full",
        color,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      )}
    >
      <Icon size={size === "sm" ? 12 : 14} />
      {label}
    </span>
  );
}

export function getStatusLabel(status: MatterStatus | string): string {
  return STATUS_LABELS[status as MatterStatus] || String(status);
}
