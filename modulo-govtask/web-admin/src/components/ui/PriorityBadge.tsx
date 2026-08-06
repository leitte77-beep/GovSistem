"use client";

import { PRIORITY_COLORS, PRIORITY_LABELS, cn } from "@/lib/utils";

type PriorityBadgeProps = {
  priority: string;
  className?: string;
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <span className={cn("status-pill", PRIORITY_COLORS[priority] || "bg-gray-100 text-gray-600", className)}>
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}
