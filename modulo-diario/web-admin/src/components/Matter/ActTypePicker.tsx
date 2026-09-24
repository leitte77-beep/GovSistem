"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { ActType } from "@/types/matter";

const ACT_TYPE_MATERIAL_ICONS: Record<string, string> = {
  "Ata": "contract",
  "Contrato": "handshake",
  "Decreto": "policy",
  "Edital": "campaign",
  "Lei": "gavel",
  "Licitação": "shopping_basket",
  "Portaria": "description",
  "Relatório": "analytics",
  "Relatório Contábil": "analytics",
  "Resolução": "rule",
  "Instrução Normativa": "menu_book",
  "Extrato": "receipt_long",
  "Termo Aditivo": "playlist_add_check",
  "Homologação": "fact_check",
  "Adjudicação": "gavel",
  "Aviso": "notifications",
  "Chamamento Público": "campaign",
  "Convênio": "handshake",
  "Comunicado": "campaign",
};

function getActTypeMaterialIcon(name: string): string {
  return ACT_TYPE_MATERIAL_ICONS[name] || "more_horiz";
}

const VISIBLE_LIMIT = 9;

interface Props {
  actTypes: ActType[];
  value: string;
  onChange: (actType: ActType) => void;
  disabled?: boolean;
  error?: string;
  generating?: boolean;
}

/**
 * Card-based act type picker (preserves the current visual pattern) with a
 * "Ver todos os tipos" modal: search + full list + keyboard navigation.
 * Types come from the database — nothing is hardcoded here.
 */
export default function ActTypePicker({ actTypes, value, onChange, error, generating }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return actTypes;
    return actTypes.filter(
      (a) =>
        a.name.toLowerCase().includes(q.toLowerCase()) ||
        (a.description ?? "").toLowerCase().includes(q.toLowerCase())
    );
  }, [actTypes, search]);

  useEffect(() => {
    if (modalOpen) {
      setSearch("");
      setHighlight(0);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, modalOpen]);

  const handleModalKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const at = filtered[highlight];
      if (at) {
        onChange(at);
        setModalOpen(false);
      }
    } else if (e.key === "Escape") {
      setModalOpen(false);
    }
  };

  const Card = ({ at, selected }: { at: ActType; selected: boolean }) => (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onChange(at)}
      className={clsx(
        "flex flex-col items-center justify-center p-3 rounded-xl border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        selected
          ? "bg-primary text-on-primary border-primary shadow-md"
          : "border-outline-variant hover:border-primary hover:bg-primary-fixed group"
      )}
    >
      <span
        className={clsx(
          "material-symbols-outlined mb-2",
          selected ? "" : "text-on-surface-variant group-hover:text-primary"
        )}
        aria-hidden="true"
      >
        {getActTypeMaterialIcon(at.name)}
      </span>
      <span
        className={clsx(
          "text-[10px] font-bold",
          selected ? "" : "text-on-surface-variant group-hover:text-primary"
        )}
      >
        {at.name}
      </span>
    </button>
  );

  return (
    <div role="radiogroup" aria-label="Tipo do ato">
      <div className="grid grid-cols-3 gap-3">
        {actTypes.slice(0, VISIBLE_LIMIT).map((at) => (
          <Card key={at.id} at={at} selected={at.id === value} />
        ))}
      </div>
      {actTypes.length > VISIBLE_LIMIT && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-label-md font-label-md text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
        >
          <span className="material-symbols-outlined text-[16px]">apps</span>
          Ver todos os tipos ({actTypes.length})
        </button>
      )}
      {actTypes.length <= VISIBLE_LIMIT && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-label-md font-label-md text-on-surface-variant hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
        >
          <span className="material-symbols-outlined text-[16px]">search</span>
          Buscar tipo
        </button>
      )}
      {error && (
        <p className="text-xs text-error mt-2 flex items-center gap-1" role="alert">
          <span className="material-symbols-outlined text-xs">warning</span> {error}
        </p>
      )}
      {generating && (
        <p className="text-xs text-primary mt-2 flex items-center gap-1">
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          Gerando próxima numeração...
        </p>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Selecionar tipo de ato"
            onKeyDown={handleModalKey}
            className="relative z-10 bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="p-4 border-b border-outline-variant">
              <label htmlFor="act-type-search" className="sr-only">Buscar tipo de ato</label>
              <input
                ref={searchRef}
                id="act-type-search"
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setHighlight(0); }}
                placeholder="Buscar tipo de ato…"
                className="w-full h-10 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 text-body-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <ul ref={listRef} className="max-h-72 overflow-y-auto py-1" role="listbox" aria-label="Tipos de ato">
              {filtered.length === 0 && (
                <li className="px-4 py-3 text-sm text-on-surface-variant">Nenhum tipo encontrado</li>
              )}
              {filtered.map((at, idx) => {
                const selected = at.id === value;
                return (
                  <li key={at.id} role="option" aria-selected={selected || idx === highlight}>
                    <button
                      type="button"
                      onClick={() => { onChange(at); setModalOpen(false); }}
                      onMouseEnter={() => setHighlight(idx)}
                      className={clsx(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                        idx === highlight ? "bg-surface-container-high" : "",
                        selected ? "text-primary font-semibold" : "text-on-surface"
                      )}
                    >
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">
                        {getActTypeMaterialIcon(at.name)}
                      </span>
                      {at.name}
                      {selected && (
                        <span className="material-symbols-outlined text-[16px] ml-auto text-secondary" aria-hidden="true">check</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-2 border-t border-outline-variant text-[10px] text-on-surface-variant">
              ↑ ↓ para navegar · Enter para selecionar · Esc para fechar
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
