"use client";

import clsx from "clsx";
import {
  MATTER_STATUSES, EDITION_STATUSES,
  type StatusDefinition,
} from "@/lib/statusConfig";

type Kind = "matter" | "edition";

interface StatusBadgeProps {
  kind: Kind;
  status: string;
  size?: "sm" | "md" | "lg";
}

function defFor(kind: Kind, status: string): StatusDefinition {
  const map = kind === "matter" ? MATTER_STATUSES : EDITION_STATUSES;
  return (map as Record<string, StatusDefinition>)[status];
}

export default function StatusBadge({ kind, status, size = "md" }: StatusBadgeProps) {
  const def = defFor(kind, status);
  if (!def) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
        {status}
      </span>
    );
  }
  const Icon = def.icon;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        def.badge,
        size === "sm" ? "px-2 py-0.5 text-xs" : size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-3 py-1 text-sm"
      )}
    >
      <Icon size={size === "sm" ? 12 : 14} aria-hidden="true" />
      <span>{def.label}</span>
    </span>
  );
}

export { matterStatusLabel, editionStatusLabel } from "@/lib/statusConfig";
