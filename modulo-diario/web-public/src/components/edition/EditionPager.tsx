import Link from "next/link";

export type EditionRef = { year: number; number: number };

export type EditionPagerProps = {
  prevEdition: EditionRef | null;
  nextEdition: EditionRef | null;
};

/** Editorial navigation between consecutive published editions. */
export default function EditionPager({ prevEdition, nextEdition }: EditionPagerProps) {
  if (!prevEdition && !nextEdition) return null;

  const card = (dir: "prev" | "next", e: EditionRef) => {
    const prev = dir === "prev";
    return (
      <Link
        href={`/edicoes/${e.year}/${e.number}`}
        className={`group flex flex-1 flex-col gap-1 rounded-2xl bg-edition-sheet px-5 py-4 ring-1 ring-edition-line transition hover:ring-[var(--edition-accent)] hover:shadow-[var(--edition-shadow-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)] ${
          prev ? "items-start text-left" : "items-end text-right"
        }`}
      >
        <span
          className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-edition-muted ${
            prev ? "" : "flex-row-reverse"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
            {prev ? "chevron_left" : "chevron_right"}
          </span>
          {prev ? "Edição anterior" : "Próxima edição"}
        </span>
        <span className="text-[15px] font-semibold text-edition-ink group-hover:text-[var(--edition-accent-strong)]">
          Edição nº {e.number} <span className="text-edition-muted">· {e.year}</span>
        </span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegação entre edições"
      className="no-print flex flex-col gap-3 border-t border-edition-line pt-8 sm:flex-row"
    >
      {prevEdition ? card("prev", prevEdition) : <span aria-hidden="true" className="flex-1" />}
      {nextEdition ? card("next", nextEdition) : <span aria-hidden="true" className="flex-1" />}
    </nav>
  );
}
