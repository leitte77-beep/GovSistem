import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getMatterPage,
  getOrganizationServer,
  getRequestOrigin,
} from "@/lib/server/edition-loader";
import { formatBrasiliaDateTime, formatLongDatePT } from "@/lib/dates";

export const dynamic = "force-dynamic";

type PageProps = { params: { id: string } };

function demoteHeadings(html: string): string {
  return html.replace(/<h1([^>]*)>/gi, "<h2$1>").replace(/<\/h1>/gi, "</h2>");
}

async function loadMatter(id: string) {
  const [matter, org, origin] = await Promise.all([
    getMatterPage(id).catch(() => null),
    getOrganizationServer().catch(() => null),
    getRequestOrigin(),
  ]);
  return { matter, org, origin };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = params.id;
  const { matter, org, origin } = await loadMatter(id);
  if (!matter) {
    return { title: "Matéria não encontrada — Diário Oficial Eletrônico" };
  }
  const orgName = org?.name || "";
  const title = `${matter.title} — ${orgName ? `Diário Oficial de ${orgName}` : "Diário Oficial Eletrônico"}`;
  const url = `${origin}/materias/${id}`;
  return {
    title,
    description: matter.summary || `Matéria oficial publicada no Diário Oficial Eletrônico.`,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: matter.summary || undefined,
      url,
      siteName: "Diário Oficial Eletrônico",
      type: "article",
      publishedTime: matter.published_at ? new Date(matter.published_at).toISOString() : undefined,
    },
    twitter: { card: "summary", title, description: matter.summary || undefined },
    robots: { index: true, follow: true },
  };
}

export default async function MatterDetailPage({ params }: PageProps) {
  const id = params.id;
  const { matter, org, origin } = await loadMatter(id);
  if (!matter) notFound();

  const signature = matter.signature;
  const signerName = signature?.certificate_subject
    ? signature.certificate_subject.split(":").slice(0, 1).join("").replace(/^CN=/, "")
    : null;

  const edition = matter.edition;
  const verificationUrl = edition?.verification_code
    ? `/verificar/${edition.verification_code}`
    : null;
  const pageUrl = `${origin}/materias/${id}`;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: matter.title,
      name: matter.title,
      url: pageUrl,
      inLanguage: "pt-BR",
      description: matter.summary || undefined,
      datePublished: matter.published_at ? new Date(matter.published_at).toISOString() : undefined,
      publisher: { "@type": "GovernmentOrganization", name: org?.name || "Diário Oficial Eletrônico" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Diário Oficial", item: `${origin}/edicoes` },
        ...(edition
          ? [
              {
                "@type": "ListItem",
                position: 3,
                name: `Edição nº ${edition.number}`,
                item: `${origin}/edicoes/${edition.year}/${edition.number}`,
              },
            ]
          : []),
        { "@type": "ListItem", position: 4, name: matter.title, item: pageUrl },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="max-w-4xl mx-auto px-gutter py-8">
        <nav aria-label="Trilha de navegação" className="text-body-sm text-on-surface-variant mb-6">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/edicoes" className="hover:text-primary hover:underline">Diário Oficial</Link>
            </li>
            {edition && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true">›</span>
                <Link href={`/edicoes/${edition.year}/${edition.number}`} className="hover:text-primary hover:underline">
                  Edição nº {edition.number}
                </Link>
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true">›</span>
              <span aria-current="page" className="text-on-surface font-semibold">{matter.title}</span>
            </li>
          </ol>
        </nav>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {matter.act_type && (
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-surface-container-high text-on-surface-variant border border-outline-variant">
              {matter.act_type}
            </span>
          )}
          {matter.org_unit && (
            <span className="text-label-md text-on-surface-variant uppercase">{matter.org_unit}</span>
          )}
        </div>

        <h1 className="text-headline-lg font-headline-lg text-primary leading-tight mb-2">{matter.title}</h1>

        {matter.summary && (
          <p className="text-body-md text-on-surface leading-relaxed border-l-2 border-primary-container pl-4 mb-4">
            {matter.summary}
          </p>
        )}

        {matter.published_at && (
          <p className="text-body-sm text-on-surface-variant mb-6">
            Publicado em {formatBrasiliaDateTime(matter.published_at)}
          </p>
        )}

        {signature && (
          <div className="mb-6 rounded-xl border border-secondary/30 bg-secondary-container/10 p-4 text-body-sm">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="material-symbols-outlined text-secondary mt-0.5">
                verified_user
              </span>
              <div>
                <p className="font-bold text-on-surface">Assinatura digital válida</p>
                <p className="mt-1 text-on-surface-variant">
                  Assinado digitalmente por {signerName || signature.certificate_label || "autoridade certificadora"}.
                </p>
                {edition && (
                  <p className="mt-1 text-on-surface-variant">
                    Esta matéria integra a Edição nº {edition.number} do Diário Oficial
                    {edition.publication_date ? `, publicada oficialmente em ${formatLongDatePT(edition.publication_date)}` : ""}.
                  </p>
                )}
                {signature.signed_at && (
                  <p className="text-xs text-on-surface-variant mt-1">
                    Assinado em {formatBrasiliaDateTime(signature.signed_at)}
                  </p>
                )}
                {signature.certificate_serial && (
                  <p className="font-mono text-[11px] text-on-surface-variant mt-1 break-all">
                    Nº de série: {signature.certificate_serial}
                  </p>
                )}
                {verificationUrl && (
                  <Link href={verificationUrl} className="inline-block mt-2 text-label-md font-bold text-primary hover:underline">
                    Verificar autenticidade
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        <div
          className="prose max-w-none text-on-surface prose-p:my-3 prose-p:text-justify prose-p:text-body-md prose-p:leading-relaxed prose-strong:font-bold prose-headings:text-center prose-headings:uppercase prose-table:w-full prose-th:bg-surface-container-low prose-td:border prose-th:border prose-td:border-outline-variant"
          dangerouslySetInnerHTML={{ __html: demoteHeadings(matter.content_html || "") }}
        />

        {matter.attachments?.length > 0 && (
          <div className="mt-8">
            <h2 className="text-label-md uppercase tracking-widest text-primary font-bold mb-3">Anexos</h2>
            <ul className="space-y-2">
              {matter.attachments.map((att: any) => (
                <li key={att.id}>
                  {att.file?.filename ? (
                    <a
                      href={`/api/download/${att.file.filename}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-body-sm text-primary underline"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-sm align-middle mr-1">
                        attach_file
                      </span>
                      {att.title || att.file.filename}
                      {att.file.size_bytes ? (
                        <span className="text-on-surface-variant ml-2">({(att.file.size_bytes / 1024).toFixed(1)} KB)</span>
                      ) : null}
                    </a>
                  ) : (
                    <span className="text-body-sm">{att.title || "Anexo"}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="mt-10 border-t border-outline-variant pt-5 text-body-sm text-on-surface-variant">
          {edition && (
            <p>
              Publicado originalmente na Edição nº {edition.number} de{" "}
              {edition.publication_date ? formatLongDatePT(edition.publication_date) : edition.year} —
              <Link href={`/edicoes/${edition.year}/${edition.number}`} className="text-primary hover:underline ml-1">
                ver a edição completa
              </Link>
              .
            </p>
          )}
          {!edition && (
            <Link href="/edicoes" className="text-primary hover:underline">
              Voltar para todas as edições
            </Link>
          )}
        </footer>
      </main>
    </>
  );
}
