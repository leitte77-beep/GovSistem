"use client";

import { cn } from "@/lib/utils";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  padding?: string;
  hover?: boolean;
  onClick?: () => void;
};

export function Card({
  children,
  className,
  padding = "p-6",
  hover = false,
  onClick,
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface-card border border-surface-border rounded-card shadow-card",
        padding,
        hover && "transition-shadow hover:shadow-elevated cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
