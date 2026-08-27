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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-primary-600 bg-primary-50 text-primary-700"
          : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary-300 hover:bg-primary-50/50 hover:text-primary-700"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={`min-w-[1.25rem] rounded-full px-1.5 text-[10px] font-semibold ${
            active ? "bg-primary-600 text-white" : "bg-surface-container text-on-surface-variant"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
