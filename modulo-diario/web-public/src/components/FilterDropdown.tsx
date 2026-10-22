"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  icon?: string;
  hint?: string;
}

interface Props {
  label: string;
  icon: string;
  value: string;
  allLabel: string;
  allIcon?: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** "list" = uma opção por linha (atos); "grid" = cartões em grade (anos). */
  layout?: "list" | "grid";
  className?: string;
  panelClassName?: string;
}

/** Seletor de filtro com painel próprio (o <select> nativo não aceita ícone,
 *  contagem em destaque nem grade). Segue o padrão listbox do WAI-ARIA. */
export default function FilterDropdown({
  label,
  icon,
  value,
  allLabel,
  allIcon = "select_all",
  options,
  onChange,
  layout = "list",
  className = "",
  panelClassName = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const all: FilterOption[] = [{ value: "", label: allLabel, icon: allIcon }, ...options];
  const selected = options.find((o) => o.value === value);
  const total = options.reduce((s, o) => s + (o.count ?? 0), 0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, all.findIndex((o) => o.value === value)));
      listRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const cols = layout === "grid" ? 2 : 1;
  const onKeyDown = (e: React.KeyboardEvent) => {
    const move = (d: number) => {
      e.preventDefault();
      setActive((i) => {
        let n = i;
        for (let k = 0; k < all.length; k++) {
          n = (n + d + all.length) % all.length;
          if (all[n].count !== 0) break;
        }
        return n;
      });
    };
    if (e.key === "ArrowDown") move(cols);
    else if (e.key === "ArrowUp") move(-cols);
    else if (e.key === "ArrowRight" && cols > 1) move(1);
    else if (e.key === "ArrowLeft" && cols > 1) move(-1);
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(all.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(all[active].value); }
    else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); if (e.key === "Escape") buttonRef.current?.focus(); }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${selected ? selected.label : allLabel}`}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-14 w-full items-center gap-2.5 rounded-xl px-3.5 text-left ring-1 ring-inset transition ${
          open
            ? "bg-white ring-2 ring-brand-accent"
            : selected
              ? "bg-brand-50 ring-brand-100 hover:bg-brand-100/60"
              : "bg-slate-50 ring-slate-200 hover:bg-slate-100"
        }`}
      >
        <span className="material-symbols-outlined text-[20px] text-brand-900" aria-hidden="true">
          {selected?.icon ?? icon}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
          <span className="block truncate text-sm font-semibold text-slate-800">
            {selected ? selected.label : allLabel}
          </span>
        </span>
        <span
          className={`material-symbols-outlined text-[20px] text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open && (
        <div
          className={`absolute left-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(7,26,51,.18)] ${panelClassName}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">{label}</span>
            {total > 0 && (
              <span className="text-[11px] font-semibold text-slate-500">
                {options.length} opç{options.length === 1 ? "ão" : "ões"}
              </span>
            )}
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onKeyDown}
            className={`max-h-[22rem] overflow-y-auto p-2 outline-none ${layout === "grid" ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-0.5"}`}
          >
            {all.map((o, i) => {
              const isSel = o.value === value;
              const disabled = o.count === 0;
              const isAll = o.value === "";
              return (
                <li
                  key={o.value || "__all"}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={disabled || undefined}
                  onMouseEnter={() => !disabled && setActive(i)}
                  onClick={() => !disabled && choose(o.value)}
                  className={`flex cursor-pointer rounded-xl px-3 transition ${
                    layout === "grid" && !isAll
                      ? `flex-col items-start gap-0.5 py-3 ring-1 ring-inset ${isSel ? "ring-brand-900" : "ring-slate-200"}`
                      : `items-center gap-3 py-2.5 ${isAll && layout === "grid" ? "col-span-2" : ""}`
                  } ${
                    disabled
                      ? "cursor-not-allowed opacity-40"
                      : isSel
                        ? "bg-brand-900 text-white"
                        : i === active
                          ? "bg-brand-50 text-brand-900"
                          : "text-slate-700"
                  }`}
                >
                  {layout === "list" || isAll ? (
                    <>
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isSel ? "bg-white/15" : "bg-slate-100 text-brand-900"
                        }`}
                        aria-hidden="true"
                      >
                        <span className="material-symbols-outlined text-[18px]">{o.icon ?? icon}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{o.label}</span>
                        {o.hint && (
                          <span className={`block truncate text-[11px] ${isSel ? "text-white/75" : "text-slate-500"}`}>{o.hint}</span>
                        )}
                      </span>
                      {o.count !== undefined && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                            isSel ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {o.count.toLocaleString("pt-BR")}
                        </span>
                      )}
                      <span
                        className={`material-symbols-outlined text-[18px] ${isSel ? "" : "invisible"}`}
                        aria-hidden="true"
                      >
                        check
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex w-full items-center justify-between">
                        <span className="text-lg font-extrabold tracking-tight tabular-nums">{o.label}</span>
                        {isSel && <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check</span>}
                      </span>
                      {o.count !== undefined && (
                        <span className={`text-[11px] font-semibold ${isSel ? "text-white/80" : "text-slate-500"}`}>
                          {o.count.toLocaleString("pt-BR")} {o.count === 1 ? "edição" : "edições"}
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
