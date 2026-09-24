"use client";
import React from "react";

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}

export default function FilterChip({ label, active, onClick, count }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-white text-muted hover:border-ink/30 hover:text-ink"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={`min-w-[1.25rem] rounded-full px-1.5 text-[10px] font-bold ${
            active ? "bg-white/20 text-white" : "bg-paper text-muted"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
