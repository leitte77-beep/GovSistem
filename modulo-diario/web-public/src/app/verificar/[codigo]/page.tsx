import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getVerificationServer, getRequestOrigin } from "@/lib/server/edition-loader";
import { formatLongDatePT } from "@/lib/dates";

export const dynamic = "force-dynamic";

type PageProps = { params: { codigo: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const code = params.codigo;
  const origin = await getRequestOrigin();
  return {
    title: `Verificação de autenticidade — ${code}`,
    robots: { index: false, follow: true },
    alternates: { canonical: `${origin}/verificar/${code}` },
  };
}

function certName(subject: string | undefined): string {
  return (subject || "").split(":").slice(0, 1).join("").replace(/^CN=/, "").trim();
}

export default async function VerificarCodePage({ params }: PageProps) {
  const code = params.codigo;
  const origin = await getRequestOrigin();
  const result = await getVerificationServer(code).catch(() => null);

  const valid = Boolean(result && result.found);
  const doc = result?.document ?? null;
  const qrUrl = `${origin}/verificar/${encodeURIComponent(code)}`;

  return (
    <main className="min-h-[calc(100vh-160px)] bg-surface py-stack-lg">
      <div className="max-w-[800px] mx-auto px-gutter flex flex-col items-center">
        <div className="w-full mb-stack-md flex items-center justify-center gap-3 bg-secondary-container/30 border border-secondary/20 py-3 px-6 rounded-full">
          <span aria-hidden="true" className="material-symbols-outlined text-on-secondary-container">
            verified_user
          </span>
          <span className="text-on-secondary-container text-label-md tracking-wider">
            VERIFICAÇÃO PÚBLICA DE AUTENTICIDADE
          </span>
        </div>

        <section className="w-full bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xl overflow-hidden">
          <div className="p-stack-md md:p-10 text-center">
            <h1 className="text-headline-md font-headline-md text-primary mb-2">
              Resultado da Verificação
            </h1>
            <p className="text-body-sm text-on-surface-variant font-mono bg-surface-container-low inline-block px-4 py-1.5 rounded-full break-all">
              Código: {code}
            </p>
          </div>

          <div className="border-t border-outline-variant p-6 md:p-8">
            {!result ? (
              <p className="text-body-sm text-error">
                Não foi possível concluir a verificação agora. Tente novamente em instantes.
              </p>
            ) : !valid ? (
              <div className="flex items-start gap-3 bg-error-container text-on-error-container p-6 rounded-xl">
                <span aria-hidden="true" className="material-symbols-outlined shrink-0">error</span>
                <div>
                  <h2 className="font-headline-sm text-headline-sm mb-1">Código não encontrado</h2>
                  <p className="text-body-sm">{result.message}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start gap-3 bg-secondary-container/20 border border-secondary/30 rounded-xl p-5">
                  <span aria-hidden="true" className="material-symbols-outlined text-secondary">verified_user</span>
                  <div>
                    <h2 className="font-bold text-on-surface">Documento localizado</h2>
                    <p className="text-body-sm text-on-surface-variant mt-1">
                      {doc?.publisher?.name
                        ? `Este código corresponde a uma publicação oficial da(o) ${doc.publisher.name}.`
                        : "Este código corresponde a uma publicação oficial."}
                    </p>
                  </div>
                </div>

                {doc && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-body-sm">
                    {doc.publisher?.name && (
                      <div className="sm:col-span-2">
                        <dt className="text-on-surface-variant uppercase text-label-md">Ente publicador</dt>
                        <dd className="font-semibold text-primary">{doc.publisher.name}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-on-surface-variant uppercase text-label-md">Edição</dt>
                      <dd className="font-semibold">
                        <Link className="text-primary hover:underline" href={doc.links.edition}>
                          nº {doc.edition.number} / {doc.edition.year}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-on-surface-variant uppercase text-label-md">Publicação</dt>
                      <dd className="font-semibold">
                        {doc.edition.publication_date ? formatLongDatePT(doc.edition.publication_date) : "—"}
                      </dd>
                    </div>
                    {doc.edition.verification_code && (
                      <div>
                        <dt className="text-on-surface-variant uppercase text-label-md">Código</dt>
                        <dd className="font-mono break-all">{doc.edition.verification_code}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-on-surface-variant uppercase text-label-md">Status</dt>
                      <dd className="font-semibold text-secondary">Publicado oficialmente</dd>
                    </div>
                    {doc.integrity.content_manifest_hash && (
                      <div className="sm:col-span-2">
                        <dt className="text-on-surface-variant uppercase text-label-md">Manifesto de conteúdo (SHA-256)</dt>
                        <dd className="font-mono text-[11px] break-all">{doc.integrity.content_manifest_hash}</dd>
                      </div>
                    )}
                    {doc.integrity.signed_pdf_hash && (
                      <div className="sm:col-span-2">
                        <dt className="text-on-surface-variant uppercase text-label-md">PDF assinado (SHA-256)</dt>
                        <dd className="font-mono text-[11px] break-all">{doc.integrity.signed_pdf_hash}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {(result.matters?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-label-md uppercase tracking-widest text-primary mb-2">
                      Publicações desta edição ({result.matters.length})
                    </h3>
                    <ul className="space-y-2">
                      {result.matters.map((m) => (
                        <li key={m.id} className="rounded-lg border border-outline-variant/70 px-3 py-2">
                          <Link href={`/materias/${m.id}`} className="text-body-sm font-semibold text-primary hover:underline">
                            {m.title}
                          </Link>
                          {m.summary && (
                            <p className="text-body-sm text-on-surface-variant">{m.summary}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-outline-variant/60 pt-5">
                  <div>
                    <p className="text-label-md text-on-surface-variant mb-1">QR Code de verificação</p>
                    {/* QR content points to the tenant permanent URL (server-derived). */}
                    <Image
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrUrl)}`}
                      alt={`QR Code de verificação para o código ${code}`}
                      width={128}
                      height={128}
                      className="w-32 h-32 bg-white border border-outline-variant rounded-lg p-1"
                    />
                  </div>
                  <div className="space-y-1 text-body-sm">
                    {doc?.links.download && (
                      <p>
                        <a href={doc.links.download} download className="text-primary hover:underline">
                          Baixar PDF oficial
                        </a>
                      </p>
                    )}
                    <p>
                      <Link href="/verificar" className="text-primary hover:underline">
                        Verificar outro código
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
