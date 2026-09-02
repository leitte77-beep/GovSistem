import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import type {
  EditionSnapshotPayload,
  SnapshotEdition,
  LegacyEditionPayload,
  SnapshotMatter,
  MatterMeta,
} from "@/lib/edition-types";
import { slugify } from "@/lib/edition-catalog";
import {
  getEditionPage,
  getOrganizationServer,
  getSiblingEditions,
  getRequestOrigin,
} from "@/lib/server/edition-loader";
import { formatBrasiliaDateTime, formatHeaderDate, formatLongDatePT } from "@/lib/dates";
import { buildAuthenticityRows } from "@/components/edition/EditionStatus";
import EditionBreadcrumb from "@/components/edition/EditionBreadcrumb";
import EditionActions from "@/components/edition/EditionActions";
import MatterDocument from "@/components/edition/MatterDocument";
import EditionPager from "@/components/edition/EditionPager";

export const dynamic = "force-dynamic";

type PageProps = { params: { ano: string; numero: string } };

interface EditionContent {
  editionMeta: SnapshotEdition;
  matters: SnapshotMatter[];
  meta: MatterMeta[];
  authenticity: EditionSnapshotPayload["authenticity"] | null;
  artifactInfo: EditionSnapshotPayload["artifacts"] | null;
  snapshotAvailable: boolean;
  kind: "snapshot" | "legacy" | "limited";
}

/** Normalize matters from snapshot or legacy payloads into a stable list. */
function normalizeMatters(raw: SnapshotMatter[] | LegacyEditionPayload["items"]): {
  matters: SnapshotMatter[];
  meta: MatterMeta[];
} {
  const src = (raw || []) as any[];
  const sorted = src
    .map((it, originalIndex) => ({ it, originalIndex }))
    .sort((a, b) => {
      const pa = a.it.position ?? Number.MAX_SAFE_INTEGER;
      const pb = b.it.position ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.originalIndex - b.originalIndex;
    });

  const matters: SnapshotMatter[] = [];
  const meta: MatterMeta[] = [];
  const used = new Set<string>();

  sorted.forEach(({ it }, index) => {
    const m = it.matter ?? it;
    const title = m?.title || "";
    if (title === "" && !m?.content_html) return;

    const idRaw = m?.id || it?.id || "";
    let anchor = idRaw ? `materia-${idRaw}` : `materia-${slugify(title) || "publicacao"}-${index}`;
    while (used.has(anchor)) {
      anchor = `${anchor}-${index}`;
    }
    used.add(anchor);

    matters.push({
      id: idRaw || null,
      position: it?.position ?? index,
      section_title: it?.section_title ?? m?.section_title ?? null,
      title: title,
      summary: m?.summary ?? null,
      content_html: m?.content_html ?? "",
      attachments: m?.attachments ?? [],
    });
    meta.push({
      id: anchor,
      anchorId: anchor,
      position: index,
      title,
      summary: m?.summary ?? null,
      section: it?.section_title ?? m?.section_title ?? null,
    });
  });

  return { matters, meta };
}

async function loadContent(year: number, number: number): Promise<EditionContent | null> {
  try {
    const loaded = await getEditionPage(year, number);

    if (loaded.kind === "snapshot") {
      const payload = loaded.payload as EditionSnapshotPayload;
      const edition = payload.edition;
      const snapshotAvailable = Boolean(payload.snapshot.has_snapshot);
      const { matters, meta } = normalizeMatters(payload.matters || []);

      if (!snapshotAvailable) {
        return {
          kind: "limited",
          snapshotAvailable: false,
          editionMeta: {
            id: edition.id,
            number: edition.number,
            year: edition.year,
            type: edition.type,
            title: edition.title,
            subtitle: edition.subtitle,
            publication_date: edition.publication_date,
            verification_code: edition.verification_code || "",
            organization: edition.organization,
            slug: edition.slug,
          },
          matters: [],
          meta: [],
          authenticity: null,
          artifactInfo: null,
        };
      }

      return {
        kind: "snapshot",
        snapshotAvailable: true,
        editionMeta: edition,
        matters,
        meta,
        authenticity: payload.authenticity,
        artifactInfo: payload.artifacts,
      };
    }

    const payload = loaded.payload as LegacyEditionPayload;
    const { matters, meta } = normalizeMatters(payload.items || []);
    return {
      kind: "legacy",
      snapshotAvailable: false,
      editionMeta: {
        id: payload.id,
        number: payload.number,
        year: payload.year,
        type: payload.type,
        title: payload.title,
        subtitle: payload.subtitle,
        publication_date: payload.publication_date,
        organization: "",
        verification_code: payload.verification_code || "",
        slug: "",
      },
      matters,
      meta,
      authenticity: null,
      artifactInfo: null,
    };
  } catch {
    return null;
  }
}

async function getPageData(year: number, number: number) {
  const [content, org, siblings, origin] = await Promise.all([
    loadContent(year, number),
    getOrganizationServer().catch(() => null),
    getSiblingEditions(year, number),
    getRequestOrigin(),
  ]);
  return { content, org, siblings, origin };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const year = Number(params.ano);
  const number = Number(params.numero);
  const data = await getPageData(year, number);
  const orgName = data.org?.name || data.content?.editionMeta.organization || "";
  const date = data.content?.editionMeta.publication_date;

  const title = `Edição nº ${number} — Diário Oficial Eletrônico${orgName ? ` de ${orgName}` : ""}`;
  const description = `Consulte a Edição nº ${number} de ${date ? formatLongDatePT(date) : year} do Diário Oficial Eletrônico. ${
    data.content ? `${data.content.matters.length} publicação(ões) oficial(is).` : ""
  }`.trim();

  const url = `${data.origin}/edicoes/${year}/${number}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Diário Oficial Eletrônico",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function EditionDetailPage({ params }: PageProps) {
  const year = Number(params.ano);
  const number = Number(params.numero);
  const data = await getPageData(year, number);

  if (!data.content) {
    notFound();
  }

  const { content, org, siblings, origin } = data;
  const { editionMeta, matters, meta, authenticity, kind } = content;

  const downloadUrl = `/api/public/v1/editions/${year}/${number}/download`;
  const viewUrl = `${downloadUrl}?inline=1`;
  const verificationCode = authenticity?.verification_code || editionMeta.verification_code;
  const verificationUrl = verificationCode ? `/verificar/${verificationCode}` : undefined;
  const pageUrl = `${origin}/edicoes/${year}/${number}`;

  const hasMatters = matters.length > 0;
  const publicationDate = editionMeta.publication_date;

  const jsonLd = [
    org?.name
      ? {
          "@context": "https://schema.org",
          "@type": "GovernmentOrganization",
          name: org.name,
          url: origin,
        }
      : null,
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `Edição nº ${editionMeta.number}`,
      url: pageUrl,
      datePublished: publicationDate ? `${publicationDate}T00:00:00` : undefined,
      inLanguage: "pt-BR",
      isPartOf: {
        "@type": "GovernmentOrganization",
        name: editionMeta.organization || org?.name || "Diário Oficial Eletrônico",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Diário Oficial", item: `${origin}/edicoes` },
        { "@type": "ListItem", position: 3, name: `Edição nº ${editionMeta.number}`, item: pageUrl },
      ],
    },
  ].filter(Boolean);

  // One shell for the whole page keeps a single, consistent, centered axis.
  const shell = "mx-auto w-full px-4 sm:px-6 lg:px-8";

  const municipality = editionMeta.organization || org?.name || "Diário Oficial Eletrônico";
  const logo = org?.logo_url || "/brasao.png";
  const headerDate = editionMeta.publication_date ? formatHeaderDate(editionMeta.publication_date) : `Ano de ${editionMeta.year}`;
  const code = authenticity?.verification_code || editionMeta.verification_code;
  const totalPages = matters.length;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="edition-canvas bg-edition-canvas">
        <div className={`${shell} pb-20 pt-6 sm:pt-9`}>
          {/* ===== Top toolbar: breadcrumb + download/view buttons ===== */}
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 no-print">
            <EditionBreadcrumb year={year} number={number} />
            <EditionActions
              downloadUrl={downloadUrl}
              viewUrl={viewUrl}
              verificationUrl={verificationUrl}
              shareTitle={`Edição nº ${number}/${year} — Diário Oficial Eletrônico`}
            />
          </div>

          {/* ===== Three-zone layout: sumário | documento | dados técnicos ===== */}
          <div className="mx-auto mt-5 grid max-w-[1360px] items-start gap-x-8 lg:grid-cols-[250px_minmax(0,1fr)_290px]">
            {/* LEFT — Sumário */}
            <aside
              aria-label="Sumário da edição"
              className="hidden no-print lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-8rem)]"
            >
              <div className="doe-side-panel">
                <h2 className="doe-band">Sumário</h2>
                <ol className="doe-side-scroll !py-0">
                  {meta.map((m, index) => (
                    <li key={m.anchorId} className="doe-summary-item border-b border-[#e6e9ef] last:border-0">
                      <a
                        href={`#${m.anchorId}`}
                        className="font-semibold text-[#123058] transition hover:text-[var(--edition-accent-strong)]"
                      >
                        {m.title}
                      </a>
                      <span className="doe-summary-index">{String(index + 1).padStart(2, "0")}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>

            {/* CENTER — Official document sheet (modelo.pdf) */}
            <div className="doe-page min-w-0 px-4 py-7 sm:px-10 sm:py-12">
              {/* Masthead — centered */}
              <header className="text-center">
                <h1 className="sr-only">
                  {`Edição nº ${editionMeta.number} de ${headerDate} — Diário Oficial Eletrônico de ${municipality}`}
                </h1>
                {logo && (
                  <Image
                    alt={org?.name ? `Brasão de ${org.name}` : "Brasão do município"}
                    src={logo}
                    width={104}
                    height={104}
                    priority
                    className="mx-auto h-24 w-auto sm:h-28"
                  />
                )}
                <p className="doe-nameplate mt-2">Diário Oficial Eletrônico</p>
                <p className="doe-municipality mt-1">{municipality}</p>
              </header>
              <hr className="doe-masthead-rule mt-5" />

              {/* Metadata row — 3 columns */}
              <div className="doe-meta-row" role="presentation">
                <div className="doe-meta-cell">
                  <span>Edição nº:</span>
                  <span className="font-bold">{editionMeta.number}</span>
                </div>
                <div className="doe-meta-cell center">{headerDate}</div>
                <div className="doe-meta-cell right">
                  <span>Publicações:</span>
                  <span className="font-bold">{totalPages}</span>
                </div>
              </div>

              {/* Digital signature banner (green) */}
              <div className="doe-signed mt-4">
                Assinado digitalmente por {municipality}
                {code ? <span> | {code}</span> : null}
              </div>

              <hr className="doe-navy-rule mt-4" />

              {hasMatters ? (
                <>
                  {/* Mobile-only centered SUMÁRIO band (sidebars hidden < lg) */}
                  <section aria-label="Sumário da edição" className="mt-7 lg:hidden">
                    <h2 className="doe-band">Sumário</h2>
                    <ol className="mt-2">
                      {meta.map((m, index) => (
                        <li key={m.anchorId} className="doe-summary-item border-b border-[#e6e9ef] last:border-0">
                          <a
                            href={`#${m.anchorId}`}
                            className="font-semibold text-[#123058] transition hover:text-[var(--edition-accent-strong)]"
                          >
                            {m.title}
                          </a>
                          <span className="doe-summary-index">{String(index + 1).padStart(2, "0")}</span>
                        </li>
                      ))}
                    </ol>
                  </section>

                  {/* Matters — official documents */}
                  <div className="mt-9 space-y-11">
                    {matters.map((m, index) => {
                      const anchorId = meta[index].anchorId;
                      return (
                        <MatterDocument
                          key={anchorId}
                          matter={m}
                          anchorId={anchorId}
                          position={index}
                          prevLink={
                            index > 0
                              ? { anchorId: meta[index - 1].anchorId, title: meta[index - 1].title }
                              : undefined
                          }
                          nextLink={
                            index < matters.length - 1
                              ? { anchorId: meta[index + 1].anchorId, title: meta[index + 1].title }
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </>
              ) : (
                <EmptyEdition downloadUrl={downloadUrl} />
              )}

              {/* Mobile-only Validação do Documento box (tech data moves to right panel on lg) */}
              {code && (
                <section className="doe-validation mt-10 lg:hidden" aria-label="Validação do Documento">
                  <h3>Validação do Documento</h3>
                  <div>
                    <p className="doe-validation-label">Código de verificação</p>
                    <span className="doe-validation-code">{code}</span>
                  </div>
                  {verificationUrl && (
                    <a className="doe-validation-link" href={verificationUrl}>
                      Verifique em {verificationUrl}
                    </a>
                  )}
                </section>
              )}

              {/* Page footer */}
              <div className="doe-page-footer">
                Diário Oficial Eletrônico — Edição nº {editionMeta.number} · {formatLongDatePT(publicationDate) || `Ano de ${editionMeta.year}`}
              </div>
            </div>

            {/* RIGHT — Dados técnicos */}
            <aside
              aria-label="Dados técnicos da edição"
              className="hidden no-print lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-8rem)]"
            >
              <div className="doe-side-panel">
                <h2 className="doe-band">Dados técnicos</h2>
                <div className="doe-side-scroll">
                  {authenticity && (
                    <div className="doe-side-block">
                      <p className="flex items-start gap-2 text-[13.5px] font-bold text-[#14532d]">
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">verified_user</span>
                        Publicação oficial
                      </p>
                      {authenticity.signatures?.[0]?.signed_at && (
                        <p className="mt-1 text-[12.5px] text-[#3f5247]">
                          Assinada digitalmente em {formatBrasiliaDateTime(authenticity.signatures[0].signed_at)}
                        </p>
                      )}
                    </div>
                  )}

                  {code && (
                    <div className="doe-side-block mt-4">
                      <p className="doe-side-label">Código de verificação</p>
                      <span className="doe-validation-code">{code}</span>
                      {verificationUrl && (
                        <a className="doe-validation-link" href={verificationUrl}>
                          Verifique em {verificationUrl}
                        </a>
                      )}
                    </div>
                  )}

                  {authenticity && (
                    <div className="doe-side-block mt-4">
                      <p className="doe-side-label">Autenticidade técnica</p>
                      <ul className="mt-1">
                        {buildAuthenticityRows(authenticity.states).map((r) => (
                          <li
                            key={r.key}
                            className="flex items-center justify-between gap-3 border-b border-[#e6e9ef] py-2 last:border-0"
                          >
                            <span className="text-[12.5px] leading-snug text-[#454c55]">{r.label}</span>
                            <span
                              className={`flex shrink-0 items-center gap-1 text-right text-[12.5px] font-semibold ${
                                r.tone === "ok"
                                  ? "text-[#14532d]"
                                  : r.tone === "warn"
                                    ? "text-[#8a5a00]"
                                    : "text-[#6b7480]"
                              }`}
                            >
                              {r.tone === "ok" ? (
                                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">check_circle</span>
                              ) : r.tone === "warn" ? (
                                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">error_outline</span>
                              ) : null}
                              {r.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {authenticity?.signatures?.[0]?.subject && (
                    <div className="doe-side-block mt-4">
                      <p className="doe-side-label">Signatário</p>
                      <p className="text-[13px] font-semibold leading-snug text-[#1a1f24]">
                        {authenticity.signatures[0].subject.split(":").slice(0, 1).join("").replace(/^CN=/, "") || authenticity.signatures[0].subject}
                      </p>
                      {authenticity.signatures[0].issuer && (
                        <p className="mt-0.5 break-words text-[12px] text-[#565d66]">Emissor: {authenticity.signatures[0].issuer}</p>
                      )}
                    </div>
                  )}

                  {authenticity?.signed_pdf_hash && (
                    <div className="doe-side-block mt-4">
                      <p className="doe-side-label">SHA-256 do PDF assinado</p>
                      <p className="break-all font-mono text-[11px] leading-relaxed text-[#565d66]">
                        {authenticity.signed_pdf_hash}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          <EditionPager prevEdition={siblings.prevEdition} nextEdition={siblings.nextEdition} />
        </div>
      </div>
    </>
  );
}


function EmptyEdition({ downloadUrl }: { downloadUrl: string }) {
  return (
    <div className="rounded-2xl bg-edition-sheet px-6 py-16 text-center shadow-[var(--edition-shadow-soft)] ring-1 ring-edition-line">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <span aria-hidden="true" className="material-symbols-outlined text-4xl text-edition-muted">
          menu_book
        </span>
        <h2 className="text-xl font-semibold text-edition-ink">
          Esta edição não possui matérias disponíveis
        </h2>
        <p className="text-[15px] text-edition-muted">
          Verifique se há uma nova publicação ou baixe o PDF oficial desta edição.
        </p>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[var(--edition-brand)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">download</span>
            Baixar PDF
          </a>
        )}
      </div>
    </div>
  );
}
