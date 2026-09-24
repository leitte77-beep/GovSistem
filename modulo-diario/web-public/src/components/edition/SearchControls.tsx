"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatterMeta } from "@/lib/edition-types";
import { kindCounts, KIND_ORDER, KIND_LABEL, matterKind } from "@/lib/edition-catalog";

export type SearchControlsProps = {
  matters: MatterMeta[];
};

const ALL = "__all__";

type FilterKey = string;

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

  useEffect(() => {
    setHasInput(query.length > 0);
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  const sectionEl = useCallback((anchorId: string): HTMLElement | null => document.getElementById(anchorId), []);

  const matchesMatter = useCallback(
    (m: MatterMeta): boolean => {
      if (activeKind !== ALL && matterKind(m.title) !== activeKind) return false;
      if (activeSection !== ALL && (m.section || "") !== activeSection) return false;
      if (!debounced) return true;
      const q = debounced.trim().toLowerCase();
      if (!q) return true;
      if (`${m.title} ${m.summary || ""} ${m.section || ""}`.toLowerCase().includes(q)) return true;
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

    const active = activeKind !== ALL || activeSection !== ALL || Boolean(debounced && debounced.trim().length > 0);
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
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)] ${
          selected
            ? "bg-edition-sheet-muted font-semibold text-[var(--edition-accent-strong)] ring-1 ring-inset ring-[var(--edition-accent)]"
            : "font-medium text-edition-muted ring-1 ring-inset ring-transparent hover:text-edition-ink-2"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div role="search">
        <label htmlFor="edition-search" className="sr-only">
          Pesquisar nesta edição
        </label>
        <div className="flex items-center gap-3 rounded-[14px] bg-edition-sheet-muted px-4 py-3 ring-1 ring-inset ring-edition-line transition focus-within:ring-2 focus-within:ring-[var(--edition-accent)] sm:px-5">
          <span aria-hidden="true" className="material-symbols-outlined text-edition-muted">search</span>
          <input
            id="edition-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar nesta edição por ato, número, nome ou assunto…"
            className="w-full bg-transparent text-[15px] text-edition-ink outline-none placeholder:text-edition-muted"
          />
          {query && (
            <button
              type="button"
              onClick={reset}
              aria-label="Limpar busca"
              className="text-edition-muted transition hover:text-[var(--edition-accent)]"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
        <p aria-live="polite" className="mt-2 px-1 text-[12.5px] text-edition-muted" data-testid="search-status">
          {announce}
        </p>
        {emptyResult && (
          <p className="mt-1 px-1 text-sm font-semibold text-edition-ink-2" role="status">
            Nenhuma matéria encontrada. Verifique o termo ou limpe a busca para ver todas as publicações.
          </p>
        )}
        {hasInput && !emptyResult && (
          <button
            type="button"
            onClick={goToFirst}
            className="mt-2 px-1 text-[13px] font-semibold text-[var(--edition-accent)] transition hover:text-[var(--edition-accent-strong)]"
          >
            Ir para o primeiro resultado →
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar"
          role="group"
          aria-label="Filtrar por tipo de ato"
        >
          {chip(ALL, "Todas as publicações", activeKind, setActiveKind)}
          {KIND_ORDER.filter((k) => kindMeta.find((c) => c.key === k)?.count).map((k) => {
            const c = kindMeta.find((c) => c.key === k)!;
            return chip(k, `${KIND_LABEL[k]}${c.count > 0 ? ` (${c.count})` : ""}`, activeKind, setActiveKind);
          })}
        </div>

        {sections.length > 0 && (
          <div
            className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar"
            role="group"
            aria-label="Filtrar por secretaria ou unidade"
          >
            {chip(ALL, "Todas as unidades", activeSection, setActiveSection)}
            {sections.map((s) => {
              const count = matters.filter((m) => m.section === s).length;
              return chip(s, `${s}${count > 0 ? ` (${count})` : ""}`, activeSection, setActiveSection);
            })}
          </div>
        )}
      </div>
    </div>
  );
}
