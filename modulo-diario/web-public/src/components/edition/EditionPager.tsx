import Link from "next/link";

export type EditionRef = { year: number; number: number };

export type EditionPagerProps = {
  prevEdition: EditionRef | null;
  nextEdition: EditionRef | null;
};

/** Editorial navigation between published editions (never an empty side). */
export default function EditionPager({ prevEdition, nextEdition }: EditionPagerProps) {
  const sides = [
    prevEdition ? { dir: "prev" as const, label: "Edição anterior", e: prevEdition } : null,
    nextEdition ? { dir: "next" as const, label: "Próxima edição", e: nextEdition } : null,
  ].filter(Boolean);

  if (sides.length === 0) return null;

  return (
    <nav
      aria-label="Navegação entre edições"
      className="mt-12 flex flex-col gap-3 border-t border-edition-line pt-8 no-print sm:flex-row"
    >
      {sides.map((s) => {
        const { dir, label, e } = s!;
        const prev = dir === "prev";
        return (
          <Link
            key={`${dir}-${e.number}`}
            href={`/edicoes/${e.year}/${e.number}`}
            className={`group flex flex-1 items-center gap-3 rounded-xl border border-edition-line bg-edition-sheet px-4 py-3.5 transition hover:border-[var(--edition-accent)] hover:shadow-[var(--edition-shadow-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)] ${
              prev ? "justify-start text-left" : "justify-end text-right"
            }`}
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[20px] text-edition-muted ${prev ? "" : "order-2"}`}>
              {prev ? "chevron_left" : "chevron_right"}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-edition-muted">
                {label}
              </span>
              <span className="block truncate text-[14px] font-semibold text-edition-ink group-hover:text-[var(--edition-accent-strong)]">
                Edição nº {e.number} · {e.year}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
