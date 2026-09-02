"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatterMeta } from "@/lib/edition-types";
import { kindCounts, KIND_ORDER, KIND_LABEL, matterKind } from "@/lib/edition-catalog";

export type SearchControlsProps = {
  matters: MatterMeta[];
};

const ALL = "__all__";

type FilterKey = string; // "__all__" or a kind key / section label

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function SearchControls({ matters }: SearchControlsProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeKind, setActiveKind] = useState<string>(ALL);
  const [activeSection, setActiveSection] = useState<string>(ALL);
  const [announce, setAnnounce] = useState<string | null>(null);
  const [hasInput, setHasInput] = useState(false);
  const [emptyResult, setEmptyResult] = useState(false);
  const firstMatchId = useRef<string | null>(null);

  const kindMeta = kindCounts(matters);
  const sections = Array.from(new Set(matters.map((m) => m.section).filter(Boolean) as string[]));

  // debounce the query so content scanning stays cheap on large editions
  useEffect(() => {
    setHasInput(query.length > 0);
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  const sectionEl = useCallback(
    (anchorId: string): HTMLElement | null => document.getElementById(anchorId),
    [],
  );

  const matchesMatter = useCallback(
    (m: MatterMeta): boolean => {
      if (activeKind !== ALL && matterKind(m.title) !== activeKind) return false;
      if (activeSection !== ALL && (m.section || "") !== activeSection) return false;
      if (!debounced) return true;
      const q = debounced.trim().toLowerCase();
      if (!q) return true;
      if (`${m.title} ${m.summary || ""} ${m.section || ""}`.toLowerCase().includes(q)) return true;
      // Search the full official text present in the rendered document.
      const el = sectionEl(m.anchorId);
      const text = el ? (el as HTMLElement).innerText || "" : "";
      return text.toLowerCase().includes(q);
    },
    [activeKind, activeSection, debounced, sectionEl],
  );

  useEffect(() => {
    let visible = 0;
    firstMatchId.current = null;
    const rx = debounced.trim().toLowerCase() ? new RegExp(escapeRegExp(debounced.trim().toLowerCase()), "i") : null;

    for (const m of matters) {
      const show = matchesMatter(m);
      const el = sectionEl(m.anchorId);
      if (el) {
        el.hidden = !show;
        // accessible highlight for the current term inside visible documents
        if (show && rx && query) {
          el.dataset.searchTerm = debounced.trim();
        } else {
          delete el.dataset.searchTerm;
        }
      }
      if (show) {
        visible += 1;
        if (!firstMatchId.current) firstMatchId.current = m.anchorId;
      }
    }

    const active =
      activeKind !== ALL || activeSection !== ALL || Boolean(debounced && debounced.trim().length > 0);
    setEmptyResult(active && visible === 0);

    if (activeKind === ALL && activeSection === ALL && !rx) {
      setAnnounce(`${visible} ${visible === 1 ? "publicação" : "publicações"} exibidas`);
    } else {
      setAnnounce(
        rx
          ? `${visible} ${visible === 1 ? "resultado" : "resultados"} em ${visible} ${visible === 1 ? "matéria" : "matérias"}`
          : `${visible} ${visible === 1 ? "publicação" : "publicações"}`,
      );
    }
  }, [matters, activeKind, activeSection, debounced, matchesMatter, query, sectionEl]);

  const reset = () => {
    setQuery("");
    setDebounced("");
    setActiveKind(ALL);
    setActiveSection(ALL);
    for (const m of matters) {
      const el = sectionEl(m.anchorId);
      if (el) {
        el.hidden = false;
        delete el.dataset.searchTerm;
      }
    }
    setEmptyResult(false);
    setAnnounce(`Todas as ${matters.length} publicações exibidas`);
  };

  const goToFirst = () => {
    if (firstMatchId.current) {
      document.getElementById(firstMatchId.current)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const chip = (key: string, label: string, active: string, onSelect: (k: string) => void) => {
    const selected = active === key;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(key === active ? ALL : key)}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-label-md font-bold border transition-colors whitespace-nowrap ${
          selected
            ? "bg-primary text-on-primary border-primary"
            : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div role="search" className="relative">
        <label htmlFor="edition-search" className="sr-only">
          Pesquisar nesta edição
        </label>
        <div className="flex items-center gap-2 bg-surface-container-low rounded-xl px-4 py-2.5 border border-outline-variant focus-within:ring-2 focus-within:ring-primary">
          <span aria-hidden="true" className="material-symbols-outlined text-on-surface-variant">
            search
          </span>
          <input
            id="edition-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar nesta edição — portaria, contrato, nome, número…"
            className="bg-transparent outline-none w-full text-body-sm text-on-surface"
          />
          {query && (
            <button
              type="button"
              onClick={reset}
              aria-label="Limpar busca"
              className="text-on-surface-variant hover:text-primary"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
        <p aria-live="polite" className="text-xs text-on-surface-variant mt-1.5 px-1" data-testid="search-status">
          {announce}
        </p>
        {emptyResult && (
          <p className="text-sm text-on-surface font-semibold mt-2 px-1" role="status">
            Nenhuma matéria encontrada para a busca atual. Limpe a busca para ver todas as publicações.
          </p>
        )}
        {hasInput && (
          <button
            type="button"
            onClick={goToFirst}
            className="mt-1 text-label-md font-bold text-primary hover:underline"
          >
            Ir para o primeiro resultado
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div
          className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
          role="group"
          aria-label="Filtrar por tipo de ato"
        >
          {chip(ALL, `Todos`, activeKind, setActiveKind)}
          {KIND_ORDER.filter((k) => kindMeta.find((c) => c.key === k)?.count).map((k) =>
            chip(k, `${KIND_LABEL[k]} (${kindMeta.find((c) => c.key === k)!.count})`, activeKind, setActiveKind),
          )}
        </div>

        {sections.length > 0 && (
          <div
            className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
            role="group"
            aria-label="Filtrar por secretaria ou unidade"
          >
            {chip(ALL, "Todas as unidades", activeSection, setActiveSection)}
            {sections.map((s) => {
              const count = matters.filter((m) => m.section === s).length;
              return chip(s, `${s} (${count})`, activeSection, setActiveSection);
            })}
          </div>
        )}
      </div>
    </div>
  );
}
