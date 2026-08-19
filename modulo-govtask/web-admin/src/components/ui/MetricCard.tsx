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
        "group relative bg-surface-card border border-surface-border rounded-card p-5 flex items-center gap-4 overflow-hidden",
        "transition-all duration-200",
        href && "card-hover-lift",
        className
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ backgroundImage: `linear-gradient(90deg, ${color}, ${color}55)` }}
      />
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105"
        style={{ background: `linear-gradient(135deg, ${color}26, ${color}0d)` }}
      >
        {IconComponent && <IconComponent className="w-5 h-5" style={{ color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-h2 text-text-title tabular-nums leading-tight">{value}</p>
        <p className="text-body-sm text-text-body truncate mt-0.5">{label}</p>
      </div>
      {href && (
        <ArrowUpRight className="w-4 h-4 text-text-subtle shrink-0 transition-all duration-200 group-hover:text-[#2563EB] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="block h-full">{content}</Link>;
  }

  return content;
}
