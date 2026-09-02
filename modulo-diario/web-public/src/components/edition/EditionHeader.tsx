import Image from "next/image";
import type { SnapshotEdition, OrganizationInfoServer } from "@/lib/edition-types";
import { formatHeaderDate } from "@/lib/dates";

export type EditionHeaderProps = {
  edition: SnapshotEdition;
  org?: OrganizationInfoServer | null;
};

/**
 * Institutional document masthead of an edition. Single <h1> = the public
 * body that issued it. Everything else is styled text (not headings) so the
 * page keeps exactly one h1 for accessibility/SEO.
 */
export default function EditionHeader({ edition, org }: EditionHeaderProps) {
  const orgName = edition.organization || org?.name || "Diário Oficial Eletrônico";
  const logo = org?.logo_url || "/brasao.png";

  return (
    <header className="edition-header text-center">
      <div className="flex justify-center mb-4">
        <Image
          alt={org?.name ? `Brasão de ${org.name}` : "Brasão do Município"}
          src={logo}
          width={96}
          height={96}
          className="h-24 w-auto"
          priority
        />
      </div>

      <p className="text-label-md font-bold text-on-surface-variant uppercase tracking-[0.35em] mb-1">
        Diário Oficial Eletrônico
      </p>

      <h1 className="text-headline-sm md:text-headline-md font-headline-md text-primary uppercase tracking-tight leading-tight mb-2">
        {orgName}
      </h1>

      <p className="text-headline-md md:text-headline-lg font-headline-lg text-primary tracking-tight uppercase mb-1">
        Edição nº {edition.number}
      </p>

      <p className="text-body-md text-on-surface-variant font-semibold">
        {edition.publication_date ? formatHeaderDate(edition.publication_date) : `Ano de ${edition.year}`}
      </p>

      {edition.subtitle && (
        <p className="mt-3 text-body-sm text-on-surface-variant max-w-2xl mx-auto">{edition.subtitle}</p>
      )}

      <div className="mt-4 mx-auto max-w-md h-px bg-primary-container" aria-hidden="true" />
    </header>
  );
}
