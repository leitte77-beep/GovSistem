"use client";

import { cn } from "@/lib/utils";

type Tab = {
  key: string;
  label: string;
  count?: number;
};

type TabsProps = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
};

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex border-b border-surface-border", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn("tab", tab.key === active ? "tab-active" : "tab-inactive")}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                "ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-meta font-medium",
                tab.key === active
                  ? "bg-[#1D4ED8]/10 text-[#1D4ED8]"
                  : "bg-[#F6F7F9] text-[#98A2B3]"
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
