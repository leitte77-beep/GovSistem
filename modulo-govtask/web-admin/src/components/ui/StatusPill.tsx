"use client";

import { STATUS_COLORS, STATUS_LABELS, cn } from "@/lib/utils";

type StatusPillProps = {
  status: string;
  className?: string;
};

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span className={cn("status-pill", STATUS_COLORS[status] || "bg-[#667085]/10 text-[#667085]", className)}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
