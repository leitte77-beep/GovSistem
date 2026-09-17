"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type HeroStat = {
  label: string;
  value: ReactNode;
  accent?: boolean;
};

type HeroPanelProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  stats?: HeroStat[];
  className?: string;
};

export function HeroPanel({ eyebrow, title, description, actions, stats, className }: HeroPanelProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-primary text-white p-6 sm:p-8",
        className
      )}
    >
      <div className="absolute inset-0 soft-blob" />
      <div className="absolute -right-12 -top-16 w-72 h-72 rounded-full bg-white/10 blur-2xl" />

      <div className="relative">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-1 min-w-0">
            {eyebrow && (
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {eyebrow}
              </p>
            )}
            <h1 className="text-h1 font-bold tracking-tight mt-1.5">{title}</h1>
            {description && (
              <p className="text-body-sm text-white/85 mt-1 max-w-xl">{description}</p>
            )}
            {actions && <div className="flex flex-wrap gap-2.5 mt-5">{actions}</div>}
          </div>

          {stats && stats.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:w-[320px] shrink-0">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className={cn(
                    "rounded-xl border p-4 backdrop-blur",
                    s.accent
                      ? "bg-white text-[#1D4ED8] border-white/30"
                      : "bg-white/10 border-white/15"
                  )}
                >
                  <p className={cn("text-[11px] font-medium", s.accent ? "text-[#1D4ED8]/70" : "text-white/75")}>
                    {s.label}
                  </p>
                  <p className={cn("text-h2 font-bold tabular-nums mt-0.5", !s.accent && "text-white")}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
