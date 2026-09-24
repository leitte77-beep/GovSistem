"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-outline">
        <Inbox size={22} aria-hidden="true" />
      </span>
      <div>
        <p className="text-headline-sm text-on-surface">{title}</p>
        {description && <p className="mt-1 max-w-md text-body-md text-on-surface-variant">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
