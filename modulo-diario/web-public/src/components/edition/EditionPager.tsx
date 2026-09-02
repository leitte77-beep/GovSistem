import Link from "next/link";

export type EditionRef = { year: number; number: number };

export type EditionPagerProps = {
  prevEdition: EditionRef | null;
  nextEdition: EditionRef | null;
};

/** Navigation between editions. Only links to editions that exist/are published. */
export default function EditionPager({ prevEdition, nextEdition }: EditionPagerProps) {
  if (!prevEdition && !nextEdition) return null;
  return (
    <nav aria-label="Navegação entre edições" className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/60 pt-5">
      {prevEdition ? (
        <Link
          href={`/edicoes/${prevEdition.year}/${prevEdition.number}`}
          className="inline-flex items-center gap-1.5 text-body-sm font-bold text-primary hover:underline"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">chevron_left</span>
          Edição anterior ({prevEdition.year}/{prevEdition.number})
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {nextEdition ? (
        <Link
          href={`/edicoes/${nextEdition.year}/${nextEdition.number}`}
          className="inline-flex items-center gap-1.5 text-body-sm font-bold text-primary hover:underline"
        >
          Próxima edição ({nextEdition.year}/{nextEdition.number})
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">chevron_right</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
