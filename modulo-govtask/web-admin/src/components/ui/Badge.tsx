"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

type BadgeProps = {
  label: string;
  color?: string;
  icon?: LucideIcon;
  className?: string;
};

export function Badge({ label, color, icon: Icon, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "status-pill",
        color || "bg-[#667085]/10 text-[#667085]",
        className
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
}
