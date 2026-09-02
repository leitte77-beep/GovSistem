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

/** Official closing of the edition document. */
export default function EditionDocumentFooter({
  edition,
  authenticity,
  downloadUrl,
  verificationUrl,
  organizationName,
}: EditionDocumentFooterProps) {
  const code = authenticity?.verification_code || edition.verification_code;
  const signedHash = authenticity?.signed_pdf_hash;
  const orgName = edition.organization || organizationName || "";

  return (
    <footer className="edition-doc-footer mt-10 border-t-2 border-primary-container pt-6">
      <div className="text-center text-body-sm text-on-surface">
        <p className="text-label-md font-bold uppercase tracking-[0.25em] text-primary">
          Diário Oficial Eletrônico
        </p>
        <p className="mt-0.5 font-semibold">{orgName}</p>
        <p className="text-on-surface-variant">
          Edição nº {edition.number} · {edition.publication_date ? formatLongDatePT(edition.publication_date) : `Ano ${edition.year}`}
        </p>
        <p className="text-on-surface-variant mt-1 text-xs">
          Documento eletrônico publicado oficialmente.
        </p>
      </div>

      {(code || signedHash) && (
        <div className="mx-auto max-w-2xl mt-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 text-body-sm">
          <div className="flex items-center gap-2 text-primary font-bold mb-3">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              verified_user
            </span>
            <span>Validação do Documento</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {code && (
              <div>
                <span className="text-label-md uppercase text-on-surface-variant">Código de autenticidade</span>
                <span className="font-mono bg-surface p-1 rounded border border-outline-variant block mt-0.5 break-all">
                  {code}
                </span>
              </div>
            )}
            {signedHash && (
              <div>
                <span className="text-label-md uppercase text-on-surface-variant">SHA-256 do PDF</span>
                <span className="font-mono bg-surface p-1 rounded border border-outline-variant text-[11px] break-all block mt-0.5">
                  {signedHash}
                </span>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            A versão impressa deste documento é uma <strong>cópia</strong> — não substitui o PDF oficial
            assinado digitalmente.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 no-print">
        {verificationUrl && code && (
          <Link href={verificationUrl} className="text-label-md font-bold text-primary hover:underline">
            Ver autenticidade
          </Link>
        )}
        {downloadUrl && (
          <a href={downloadUrl} download className="inline-flex items-center gap-1.5 text-label-md font-bold text-primary hover:underline">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">download</span>
            Baixar PDF
          </a>
        )}
        <Link href="/edicoes" className="text-label-md font-bold text-primary hover:underline">
          Voltar para todas as edições
        </Link>
      </div>
    </footer>
  );
}
