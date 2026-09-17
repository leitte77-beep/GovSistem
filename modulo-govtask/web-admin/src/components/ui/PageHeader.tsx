"use client";

import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./Breadcrumbs";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  eyebrow?: string;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-3">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#2563EB] mb-1">
              {eyebrow}
            </p>
          )}
          <h1 className="text-h1 text-text-title tracking-tight">{title}</h1>
          {description && (
            <p className="text-body-sm text-text-body mt-1.5">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
