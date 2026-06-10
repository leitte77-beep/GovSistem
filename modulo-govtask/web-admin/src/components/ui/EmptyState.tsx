"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
};

const iconCache: Record<string, string> = {
  "file-text": "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z M14 2v6h6 M8 13h2 M8 17h4 M8 9h8",
  "inbox": "M22 13.5V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7.5 M5.5 2h13a2 2 0 0 1 2 2L22 10H2L3.5 4a2 2 0 0 1 2-2Z M2 10h20",
  "search": "M21 21l-4.3-4.3 M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
  "alert-triangle": "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  "clipboard-list": "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z M9 12h6 M9 16h6 M12 9h.01",
};

function InlineIcon({ name }: { name: string }) {
  const pathData = iconCache[name];
  if (!pathData) {
    return <div className="w-12 h-12 rounded-full bg-surface-bg flex items-center justify-center mb-4">
      <span className="text-2xl text-text-subtle">—</span>
    </div>;
  }

  const paths = pathData.split(" M").filter(Boolean).map((d, i) => {
    const pathD = i === 0 ? d : `M${d}`;
    return <path key={i} d={pathD} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  });

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      className="text-text-subtle mb-4"
    >
      {paths}
    </svg>
  );
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      {icon ? (
        <InlineIcon name={icon} />
      ) : (
        <div className="w-12 h-12 rounded-full bg-surface-bg flex items-center justify-center mb-4">
          <span className="text-2xl text-text-subtle">—</span>
        </div>
      )}
      <h3 className="text-h3 text-text-title mb-1">{title}</h3>
      {description && <p className="text-body-sm text-text-body max-w-sm mb-6">{description}</p>}
      {action && (
        <Link href={action.href} className="btn-primary">
          {action.label}
        </Link>
      )}
    </div>
  );
}
