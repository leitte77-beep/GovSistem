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
      <Inbox size={40} className="text-gray-300" aria-hidden="true" />
      <div>
        <p className="text-base font-semibold text-gray-800">{title}</p>
        {description && <p className="mt-1 max-w-md text-sm text-gray-600">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
