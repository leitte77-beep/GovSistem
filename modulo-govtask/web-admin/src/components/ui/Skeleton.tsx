"use client";

import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
  variant?: "text" | "card" | "circle" | "rect";
};

export function Skeleton({ className, variant = "text" }: SkeletonProps) {
  const variantClass =
    variant === "text"
      ? "h-4 w-full rounded"
      : variant === "card"
        ? "h-40 w-full rounded-card"
        : variant === "circle"
          ? "h-10 w-10 rounded-full"
          : "h-20 w-full rounded";

  return <div className={cn("skeleton", variantClass, className)} />;
}
