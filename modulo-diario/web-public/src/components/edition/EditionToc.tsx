"use client";

import { useEffect, useState } from "react";
import type { MatterMeta } from "@/lib/edition-types";

export type EditionTocProps = {
  matters: MatterMeta[];
};

/**
 * "Nesta edição" — editorial summary with a live active-matter indicator.
 * Server-rendered plain anchors (stable ids, indexable). On the client an
 * IntersectionObserver syncs the active item while the user scrolls. The
 * surrounding UI stays quiet: no heavy cards, only subtle separators.
 */
export default function EditionToc({ matters }: EditionTocProps) {
  const [activeId, setActiveId] = useState<string | null>(matters[0]?.anchorId ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const items = matters.map((m) => document.getElementById(m.anchorId)).filter(Boolean);
    if (items.length === 0) return;

    // Bias the "active" band toward the top of the reading viewport so the
    // entry currently being read wins over ones far below/above.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      {
        rootMargin: "-12% 0px -72% 0px",
        threshold: 0,
      },
    );

    items.forEach((el) => observer.observe(el as Element));
    return () => observer.disconnect();
  }, [matters]);

  if (matters.length === 0) return null;

  return (
    <nav aria-label="Sumário" className="edition-toc">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-edition-accent">
        Nesta edição
      </p>
      <p className="mt-1 text-[13px] text-edition-muted">
        {matters.length} {matters.length === 1 ? "publicação" : "publicações"}
      </p>

      <ol className="mt-5 border-t border-edition-line">
        {matters.map((m) => {
          const isActive = m.anchorId === activeId;
          return (
            <li key={m.anchorId} className="border-b border-edition-line/70">
              <a
                href={`#${m.anchorId}`}
                className="toc-link group block py-3 pl-4 transition-colors duration-200"
                data-active={isActive}
                aria-current={isActive ? "true" : undefined}
              >
                <span className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className={`shrink-0 text-[11px] font-semibold tabular-nums transition-colors ${
                      isActive ? "text-[var(--edition-accent)]" : "text-edition-muted"
                    }`}
                  >
                    {String(m.position + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-[13.5px] font-semibold leading-snug transition-colors ${
                      isActive ? "text-[var(--edition-brand)]" : "text-edition-ink group-hover:text-[var(--edition-accent)]"
                    }`}
                  >
                    {m.title}
                  </span>
                </span>
                {m.section && (
                  <span className="mt-0.5 block pl-[1.35rem] text-[12px] text-edition-muted">
                    {m.section}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
