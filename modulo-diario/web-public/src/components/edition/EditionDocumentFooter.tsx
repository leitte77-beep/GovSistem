import Link from "next/link";
import type { SnapshotEdition, Authenticity } from "@/lib/edition-types";
import { formatLongDatePT } from "@/lib/dates";
import EditionAuthSheet from "./EditionAuthSheet";

export type EditionDocumentFooterProps = {
  edition: SnapshotEdition;
  authenticity?: Authenticity | null;
  downloadUrl?: string;
  verificationUrl?: string;
  organizationName?: string;
};

/**
 * Minimal "PUBLICAÇÃO OFICIAL" closing band. No repetition of the top
 * masthead — just what a citizen needs to confirm authenticity.
 */
export default function EditionDocumentFooter({
  edition,
  authenticity,
  downloadUrl,
  verificationUrl,
  organizationName,
}: EditionDocumentFooterProps) {
  const code = authenticity?.verification_code || edition.verification_code;
  const dateText = edition.publication_date
    ? formatLongDatePT(edition.publication_date)
    : `ano de ${edition.year}`;
  const orgName = edition.organization || organizationName;

  const subtleLink =
    "inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-[var(--edition-accent)] transition hover:text-[var(--edition-accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)]";

  return (
    <footer className="edition-doc-footer mt-14 border-t border-edition-line pt-10 sm:mt-16">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-edition-accent">
        Publicação oficial
      </p>

      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-edition-ink-2">
        Esta matéria integra a Edição nº {edition.number} do Diário Oficial Eletrônico
        {orgName ? <> de {orgName}</> : ""}, publicada em {dateText}.
      </p>

      {code && (
        <div className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-edition-muted">
            Código de autenticidade
          </p>
          <code className="mt-1 block select-all font-mono text-[15px] tracking-wide text-edition-ink">
            {code}
          </code>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 no-print">
        {verificationUrl && (
          <Link href={verificationUrl} className={subtleLink}>
            Ver autenticidade
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        )}
        {authenticity && <EditionAuthSheet authenticity={authenticity} />}
        {downloadUrl && (
          <a href={downloadUrl} download className={subtleLink}>
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">download</span>
            Baixar PDF
          </a>
        )}
      </div>

      <p className="mt-7 flex max-w-xl items-start gap-1.5 text-[12px] leading-relaxed text-edition-muted">
        <span aria-hidden="true" className="material-symbols-outlined mt-px text-[14px]">info</span>
        A versão impressa deste documento é uma cópia e não substitui o PDF oficial assinado digitalmente.
      </p>
    </footer>
  );
}
