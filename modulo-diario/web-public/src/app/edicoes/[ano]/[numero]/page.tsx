import { notFound } from "next/navigation";
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
import { formatHeaderDate, formatLongDatePT } from "@/lib/dates";
import EditionBreadcrumb from "@/components/edition/EditionBreadcrumb";
import EditionHeader from "@/components/edition/EditionHeader";
import EditionActions from "@/components/edition/EditionActions";
import EditionStatus from "@/components/edition/EditionStatus";
import EditionSummary from "@/components/edition/EditionSummary";
import SearchControls from "@/components/edition/SearchControls";
import MatterDocument from "@/components/edition/MatterDocument";
import EditionDocumentFooter from "@/components/edition/EditionDocumentFooter";
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
    // legacy items wrap the matter inside `.matter`
    const m = it.matter ?? it;
    const title = m?.title || "";
    if (title === "" && !m?.content_html) return; // skip empty legacy placeholders

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

    // legacy
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

  const publicationDate = editionMeta.publication_date;
  const publishedLabel = publicationDate
    ? `Publicada em ${formatLongDatePT(publicationDate)}.`
    : `Edição do ano de ${year}.`;

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

  const summary = meta.length === 0 ? [] : meta;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-container-max mx-auto px-gutter py-stack-md">
        <EditionBreadcrumb year={year} number={number} />

        <div className="mt-4">
          <EditionHeader edition={editionMeta} org={org} />
        </div>

        {/* principal actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <EditionActions
            downloadUrl={downloadUrl}
            viewUrl={viewUrl}
            verificationUrl={verificationUrl}
            shareTitle={`Edição nº ${number}/${year} — Diário Oficial Eletrônico`}
          />
        </div>

        {/* official status */}
        {kind === "snapshot" && authenticity ? (
          <div className="mt-6 mx-auto max-w-3xl">
            <EditionStatus edition={editionMeta} authenticity={authenticity} publishedLabel={publishedLabel} />
          </div>
        ) : kind === "limited" || kind === "legacy" ? (
          <div className="mt-6 mx-auto max-w-3xl rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <p className="text-body-sm text-on-surface-variant">
              {kind === "legacy"
                ? "Edição publicada em formato legado — o conteúdo original pode ser consultado no PDF oficial."
                : "Esta edição não possui snapshot imutável disponível no momento. Tente novamente ou baixe o PDF oficial."}
            </p>
          </div>
        ) : null}
      </div>

      {kind === "snapshot" ? (
        <div className="max-w-[1280px] mx-auto px-gutter pb-12">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(230px,19rem)_1fr] gap-8 items-start mt-8">
            {/* desktop sticky summary */}
            <aside
              aria-label="Painel de navegação da edição"
              className="hidden xl:block xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-auto no-print"
            >
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
                <EditionSummary matters={summary} />
              </div>
            </aside>

            <div className="min-w-0">
              {/* mobile summary */}
              <details
                id="edition-summary"
                className="xl:hidden mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 no-print"
              >
                <summary className="inline-flex cursor-pointer items-center gap-2 text-label-md font-bold text-primary">
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    menu_book
                  </span>
                  Sumário — {matters.length} {matters.length === 1 ? "publicação" : "publicações"}
                </summary>
                <div className="mt-4">
                  <EditionSummary matters={summary} />
                </div>
              </details>

              {/* search + filters */}
              {matters.length > 0 && (
                <div className="mb-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 no-print">
                  <SearchControls matters={meta} />
                </div>
              )}

              {matters.length === 0 ? (
                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center text-body-sm text-on-surface-variant">
                  Nenhuma publicação encontrada nesta edição.
                </div>
              ) : (
                <article className="space-y-10" aria-label="Publicações da edição">
                  {matters.map((m, index) => (
                    <MatterDocument
                      key={meta[index].anchorId}
                      matter={m}
                      anchorId={meta[index].anchorId}
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
                  ))}
                </article>
              )}

              <EditionDocumentFooter
                edition={editionMeta}
                authenticity={authenticity}
                downloadUrl={downloadUrl}
                verificationUrl={verificationUrl}
                organizationName={org?.name}
              />

              <div className="mt-6">
                <EditionPager prevEdition={siblings.prevEdition} nextEdition={siblings.nextEdition} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-[1280px] mx-auto px-gutter pb-12">
          <EditionDocumentFooter
            edition={editionMeta}
            authenticity={null}
            downloadUrl={downloadUrl}
            verificationUrl={verificationUrl}
            organizationName={org?.name}
          />
          <div className="mt-6">
            <EditionPager prevEdition={siblings.prevEdition} nextEdition={siblings.nextEdition} />
          </div>
        </div>
      )}
    </>
  );
}
