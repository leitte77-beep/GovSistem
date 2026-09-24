"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-body-sm text-on-surface-variant">
      <Link href="/" className="flex items-center gap-1 transition-colors hover:text-primary" aria-label="Início">
        <Home size={14} aria-hidden="true" />
      </Link>
      {items.map((item, idx) => (
        <span key={idx} className="flex items-center gap-1.5">
          <ChevronRight size={12} className="text-outline" aria-hidden="true" />
          {item.href ? (
            <Link href={item.href} className="transition-colors hover:text-primary">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-on-surface">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
