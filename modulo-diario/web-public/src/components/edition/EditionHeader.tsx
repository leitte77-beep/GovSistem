import Image from "next/image";
import type {
  SnapshotEdition,
  OrganizationInfoServer,
  Authenticity,
} from "@/lib/edition-types";
import { formatHeaderDate } from "@/lib/dates";

export type EditionHeaderProps = {
  edition: SnapshotEdition;
  org?: OrganizationInfoServer | null;
  kind?: "snapshot" | "legacy" | "limited";
  authenticity?: Authenticity | null;
  countLabel?: string;
  publishedLabel?: string | null;
};

type StatusTone = "ok" | "neutral" | "legacy";

/** A discreet, officially-flavoured status line — never a heavy card. */
function statusMeta(kind?: string, authenticity?: Authenticity | null): {
  tone: StatusTone;
  title: string;
} {
  if (kind === "limited") return { tone: "neutral", title: "Publicação indisponível" };
  if (kind === "legacy") return { tone: "legacy", title: "Publicação legada" };
  if (authenticity) {
    const trusted = Boolean(authenticity.states.trusted);
    const intact = Boolean(authenticity.states.intact);
    if (trusted) return { tone: "ok", title: "Publicação oficial" };
    if (intact) return { tone: "neutral", title: "Publicação com integridade verificada" };
    return { tone: "neutral", title: "Publicação verificada" };
  }
  return { tone: "neutral", title: "Publicação eletrônica oficial" };
}

/**
 * Institutional document masthead of an edition.
 * Single <h1> (visually hidden) carries the full resource name; everything on
 * screen is styled text so the page keeps exactly one h1 for a11y/SEO.
 */
export default function EditionHeader({
  edition,
  org,
  kind = "snapshot",
  authenticity,
  countLabel,
}: EditionHeaderProps) {
  const orgName = edition.organization || org?.name || "Diário Oficial Eletrônico";
  const logo = org?.logo_url || "/brasao.png";
  const dateText = edition.publication_date
    ? formatHeaderDate(edition.publication_date)
    : `Ano de ${edition.year}`;

  const { tone, title } = statusMeta(kind, authenticity);

  const dotColor =
    tone === "ok"
      ? "bg-[var(--edition-success)]"
      : tone === "legacy"
        ? "bg-[var(--edition-muted)]"
        : "bg-[var(--edition-accent)]";

  return (
    <header className="edition-header text-center">
      <h1 className="sr-only">
        {`${orgName} — Diário Oficial Eletrônico, Edição nº ${edition.number} de ${dateText}`}
      </h1>

      {logo && (
        <div className="mx-auto mb-5 flex justify-center">
          <Image
            alt={org?.name ? `Brasão de ${org.name}` : "Brasão do município"}
            src={logo}
            width={96}
            height={96}
            className="h-16 w-auto sm:h-20 lg:h-24"
            priority
          />
        </div>
      )}

      <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-edition-accent sm:text-xs">
        Diário Oficial Eletrônico
      </p>

      <p className="mx-auto mt-3 max-w-3xl text-base font-bold uppercase leading-snug tracking-[0.02em] text-edition-ink sm:text-xl lg:text-2xl">
        {orgName}
      </p>

      <div className="mt-6 flex flex-col items-center">
        <p className="text-[clamp(2.4rem,6vw,3.4rem)] font-extrabold leading-none tracking-tight text-edition-ink">
          <span className="text-edition-muted sm:text-edition-ink">Edição nº </span>
          <span className="text-[var(--edition-brand)]">{edition.number}</span>
        </p>
        <p className="mt-3 text-base font-medium text-edition-ink-2 sm:text-lg">
          {dateText}
        </p>
      </div>

      {edition.subtitle && (
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-edition-muted">
          {edition.subtitle}
        </p>
      )}

      {/* discreet official meta line */}
      <div className="mt-7 flex flex-col items-center gap-3">
        <div className="inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 ring-1 ring-edition-line bg-edition-sheet">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-edition-ink-2">
            {title}
          </span>
        </div>
        <p className="text-sm text-edition-muted">{countLabel}</p>
      </div>

      <hr className="hero-rule mx-auto mt-8 max-w-xl" aria-hidden="true" />
    </header>
  );
}
