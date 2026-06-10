"use client";

import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  icon: string;
  color: string;
  href?: string;
  className?: string;
};

export function MetricCard({ label, value, icon, color, href, className }: MetricCardProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icons = LucideIcons as any;
  const IconComponent = Icons[icon];

  const content = (
    <div
      className={cn(
        "bg-surface-card border border-surface-border rounded-card p-5 flex items-center gap-4",
        href && "transition-shadow hover:shadow-elevated",
        className
      )}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        {IconComponent && <IconComponent className="w-5 h-5" style={{ color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-h2 text-text-title tabular-nums">{value}</p>
        <p className="text-body-sm text-text-body truncate">{label}</p>
      </div>
      {href && (
        <ArrowUpRight className="w-4 h-4 text-text-subtle shrink-0" />
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
