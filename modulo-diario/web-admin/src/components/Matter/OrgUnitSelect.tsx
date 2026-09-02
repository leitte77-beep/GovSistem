"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { OrgUnit } from "@/types/matter";

interface Props {
  orgUnits: OrgUnit[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/**
 * Searchable publication-unit selector.
 * Shows full unit names (with parent hierarchy) instead of bare
 * abbreviations; the stored value remains the technical ID.
 */
export default function OrgUnitSelect({ orgUnits, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = orgUnits.find((o) => o.id === value) ?? null;

  const displayName = (u: OrgUnit) =>
    u.parent_name ? `${u.parent_name} › ${u.name}` : u.name;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgUnits;
    return orgUnits.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.parent_name ?? "").toLowerCase().includes(q) ||
        (o.abbreviation ?? "").toLowerCase().includes(q)
    );
  }, [orgUnits, search]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      const ou = filtered[highlight];
      if (ou) {
        onChange(ou.id);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={clsx(
          "w-full min-h-12 bg-surface-container-lowest border rounded-xl px-4 py-2 flex items-center justify-between gap-2 text-left focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all",
          "border-outline-variant",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className={clsx("text-body-sm truncate", selected ? "text-on-surface" : "text-on-surface-variant")}>
          {selected ? (selected.parent_name ? `${selected.parent_name} › ${selected.name}` : selected.name) : "Selecione a unidade publicadora…"}
        </span>
        <span className="material-symbols-outlined text-on-surface-variant shrink-0" aria-hidden="true">expand_more</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-outline-variant">
            <label htmlFor="org-unit-search" className="sr-only">Buscar unidade</label>
            <input
              ref={inputRef}
              id="org-unit-search"
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setHighlight(0); }}
              onKeyDown={handleKey}
              placeholder="Buscar unidade…"
              className="w-full h-9 bg-surface-container-low rounded-lg px-3 text-body-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <ul role="listbox" aria-label="Unidades publicadoras" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-4 py-2 text-sm text-on-surface-variant">Nenhuma unidade encontrada</li>
            )}
            {filtered.map((ou, idx) => {
              const active = ou.id === value;
              return (
                <li key={ou.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => { onChange(ou.id); setOpen(false); }}
                    onMouseEnter={() => setHighlight(idx)}
                    className={clsx(
                      "w-full px-4 py-2 text-left text-body-sm flex items-center gap-2 transition-colors",
                      idx === highlight ? "bg-surface-container-high" : "",
                      active ? "text-primary font-semibold" : "text-on-surface"
                    )}
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">
                        {ou.parent_name && <span className="text-on-surface-variant">{ou.parent_name} › </span>}
                        {ou.name}
                      </span>
                      {ou.abbreviation && (
                        <span className="text-[10px] text-on-surface-variant">{ou.abbreviation}</span>
                      )}
                    </span>
                    {active && <span className="material-symbols-outlined text-[16px] ml-auto text-secondary" aria-hidden="true">check</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
