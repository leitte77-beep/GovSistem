"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={cn("flex items-center gap-1 text-body-sm", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;

        return (
          <span key={i} className="flex items-center gap-1">
            {isLast ? (
              <span className="text-text-title font-medium">{item.label}</span>
            ) : item.href ? (
              <Link href={item.href} className="text-text-subtle hover:text-text-body transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-text-subtle">{item.label}</span>
            )}
            {!isLast && <ChevronRight className="w-4 h-4 text-text-subtle shrink-0" />}
          </span>
        );
      })}
    </nav>
  );
}
