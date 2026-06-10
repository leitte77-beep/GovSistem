"use client";

import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./Breadcrumbs";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-3">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-text-title">{title}</h1>
          {description && (
            <p className="text-body-sm text-text-body mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
