import Link from "next/link";
import type { SnapshotEdition, Authenticity } from "@/lib/edition-types";
import { formatLongDatePT } from "@/lib/dates";

export type EditionDocumentFooterProps = {
  edition: SnapshotEdition;
  authenticity?: Authenticity | null;
  downloadUrl?: string;
  verificationUrl?: string;
  organizationName?: string;
};

/** Quiet, institutional closing of the edition page (below the document). */
export default function EditionDocumentFooter({
  edition,
  downloadUrl,
  verificationUrl,
  organizationName,
}: EditionDocumentFooterProps) {
  const orgName = edition.organization || organizationName || "";
  const dateText = edition.publication_date
    ? formatLongDatePT(edition.publication_date)
    : `Ano de ${edition.year}`;

  const link =
    "inline-flex items-center gap-1.5 text-[13px] font-semibold text-edition-ink-2 transition hover:text-[var(--edition-accent-strong)]";

  return (
    <footer className="edition-doc-footer mt-16 border-t border-edition-line pt-10 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-edition-accent">
        Diário Oficial Eletrônico
      </p>
      {orgName && <p className="mt-2 text-[15px] font-semibold text-edition-ink">{orgName}</p>}
      <p className="mt-0.5 text-[13px] text-edition-muted">
        Edição nº {edition.number} · {dateText}
      </p>

      <p className="mx-auto mt-5 max-w-xl text-[12.5px] leading-relaxed text-edition-muted">
        A versão impressa deste documento é uma cópia e não substitui o PDF oficial assinado digitalmente.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 no-print">
        {verificationUrl && (
          <Link href={verificationUrl} className={link}>
            Ver autenticidade
          </Link>
        )}
        {downloadUrl && (
          <a href={downloadUrl} download className={link}>
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">download</span>
            Baixar PDF
          </a>
        )}
        <Link href="/edicoes" className={link}>
          Todas as edições
        </Link>
      </div>
    </footer>
  );
}
