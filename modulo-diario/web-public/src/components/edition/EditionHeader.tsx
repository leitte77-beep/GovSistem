import Image from "next/image";
import Link from "next/link";
import type {
  SnapshotEdition,
  OrganizationInfoServer,
  Authenticity,
} from "@/lib/edition-types";
import { formatHeaderDate, formatBrasiliaDateTime } from "@/lib/dates";

export type EditionHeaderProps = {
  edition: SnapshotEdition;
  org?: OrganizationInfoServer | null;
  kind?: "snapshot" | "legacy" | "limited";
  authenticity?: Authenticity | null;
  countLabel?: string;
  publishedLabel?: string | null;
  verificationUrl?: string;
};

/** Trustworthy headline status — single, honest, non-alarming. */
function summary(authenticity?: Authenticity | null): {
  ok: boolean;
  title: string;
  detail?: string;
} | null {
  if (!authenticity) return null;
  const states = authenticity.states;
  const first = authenticity.signatures?.[0];
  const signedAt = first?.signed_at || first?.timestamp || null;
  if (states.trusted) return { ok: true, title: "Publicação oficial", detail: "Assinatura confiável (ICP-Brasil)" };
  if (states.signed) {
    const detail = signedAt ? `Assinada digitalmente em ${formatBrasiliaDateTime(signedAt)}` : "Assinada digitalmente pelo órgão emissor";
    return { ok: true, title: "Publicação oficial verificada", detail };
  }
  return { ok: true, title: "Publicação oficial verificada", detail: "Documento eletrônico oficial" };
}

/**
 * Masthead of an edition. Left-aligned, quiet and editorial: small brasão
 * beside the nameplate, a single dominant "Edição nº X", the date and one
 * summary status line. One <h1> (sr-only) keeps the page heading unique.
 */
export default function EditionHeader({
  edition,
  org,
  kind = "snapshot",
  authenticity,
  countLabel,
  verificationUrl,
}: EditionHeaderProps) {
  const municipality = edition.organization || org?.name || "Diário Oficial Eletrônico";
  const logo = org?.logo_url || "/brasao.png";
  const dateText = edition.publication_date ? formatHeaderDate(edition.publication_date) : `Ano de ${edition.year}`;
  const status = summary(kind === "snapshot" ? authenticity : null);

  return (
    <header className="edition-header">
      <h1 className="sr-only">
        {`Edição nº ${edition.number} de ${dateText} — Diário Oficial Eletrônico de ${municipality}`}
      </h1>

      {/* identity lockup: small brasão + nameplate */}
      <div className="flex items-center gap-4 sm:gap-5">
        {logo && (
          <Image
            alt={org?.name ? `Brasão de ${org.name}` : "Brasão do município"}
            src={logo}
            width={64}
            height={64}
            priority
            className="h-14 w-auto shrink-0 sm:h-16"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold uppercase tracking-[0.02em] text-edition-muted sm:text-sm">
            {municipality}
          </p>
          <p className="truncate text-lg font-extrabold tracking-tight text-[var(--edition-brand)] sm:text-[22px]">
            Diário Oficial Eletrônico
          </p>
        </div>
      </div>

      {/* edition + date */}
      <div className="mt-7 sm:mt-9">
        <h2 className="text-[clamp(2rem,4.5vw,2.9rem)] font-extrabold leading-none tracking-tight text-edition-ink">
          Edição nº <span className="text-[var(--edition-accent)]">{edition.number}</span>
        </h2>
        <p className="mt-2 text-[15px] font-medium text-edition-ink-2 sm:text-[16px]">
          {dateText}
        </p>
        {countLabel ? (
          <p className="mt-1 text-[13px] text-edition-muted">{countLabel}</p>
        ) : null}
      </div>

      {edition.subtitle && (
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-edition-muted">{edition.subtitle}</p>
      )}

      {/* single, honest status line + verification link */}
      {status && (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-edition-ink-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-[var(--edition-success)]">
              check_circle
            </span>
            {status.title}
          </p>
          {status.detail && <span className="hidden text-[13px] text-edition-muted sm:inline">· {status.detail}</span>}
          {verificationUrl && (
            <Link
              href={verificationUrl}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--edition-accent)] transition hover:text-[var(--edition-accent-strong)]"
            >
              Ver autenticidade
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          )}
        </div>
      )}

      {(kind === "legacy" || kind === "limited") && (
        <p className="mt-5 max-w-2xl rounded-xl bg-edition-sheet px-4 py-3 text-[13.5px] leading-relaxed text-edition-ink-2 ring-1 ring-edition-line">
          {kind === "legacy"
            ? "Edição publicada em formato legado — o conteúdo integral pode ser consultado no PDF oficial."
            : "Esta edição ainda não possui snapshot imutável disponível. Tente novamente ou baixe o PDF oficial."}
        </p>
      )}
    </header>
  );
}
