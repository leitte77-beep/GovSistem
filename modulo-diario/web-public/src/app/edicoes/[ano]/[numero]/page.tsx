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
import { formatLongDatePT } from "@/lib/dates";
import EditionBreadcrumb from "@/components/edition/EditionBreadcrumb";
import EditionHeader from "@/components/edition/EditionHeader";
import EditionActions from "@/components/edition/EditionActions";
import EditionToc from "@/components/edition/EditionToc";
import MobileTocDrawer from "@/components/edition/MobileTocDrawer";
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
  // Layout is driven by real content: a single matter reads centered; only a
  // larger set justifies the two-column summary.
  const isMulti = meta.length > 1;
  const countLabel = `${matters.length} ${matters.length === 1 ? "publicação" : "publicações"} oficiais`;

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

  // One shell for the whole page keeps a single, consistent axis.
  const shell = `mx-auto w-full px-4 sm:px-6 lg:px-8 ${
    isMulti ? "max-w-[1180px]" : "max-w-[900px]"
  }`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="edition-canvas bg-edition-canvas">
        {/* ============ Masthead (single axis, aligned to the document) ============ */}
        <div className={`${shell} pt-6 sm:pt-9`}>
          <EditionBreadcrumb year={year} number={number} />
          <EditionHeader
            edition={editionMeta}
            org={org}
            kind={kind}
            authenticity={authenticity}
            countLabel={countLabel}
            verificationUrl={verificationUrl}
          />
          {/* actions — primary + quiet overflow */}
          <div className="mt-6 flex items-center gap-1 no-print">
            <EditionActions
              downloadUrl={downloadUrl}
              viewUrl={viewUrl}
              verificationUrl={verificationUrl}
              shareTitle={`Edição nº ${number}/${year} — Diário Oficial Eletrônico`}
            />
          </div>
        </div>

        {/* ============ Body ============ */}
        <div className={`${shell} pb-24 pt-8 sm:pt-10`}>
          {hasMatters ? (
            isMulti ? (
              /* several matters → summary + document */
              <>
                <div className="no-print lg:mb-9">
                  <SearchControls matters={meta} />
                </div>
                <div className="grid items-start gap-x-8 lg:grid-cols-[260px_minmax(0,1fr)]">
                  <aside
                    aria-label="Sumário da edição"
                    className="hidden lg:block lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-auto no-print"
                  >
                    <EditionToc matters={meta} />
                  </aside>
                  <div className="min-w-0">
                    <div className="mb-6 lg:hidden no-print">
                      <MobileTocDrawer matters={meta} totalLabel={countLabel} />
                    </div>
                    <EditionSheet
                      matters={matters}
                      meta={meta}
                      single={false}
                    />
                  </div>
                </div>
              </>
            ) : (
              /* one matter → single centered document, matéria as protagonist */
              <EditionSheet matters={matters} meta={meta} single />
            )
          ) : (
            <EmptyEdition downloadUrl={downloadUrl} />
          )}

          {/* minimal official closing + verification */}
          <EditionDocumentFooter
            edition={editionMeta}
            authenticity={authenticity}
            downloadUrl={downloadUrl}
            verificationUrl={verificationUrl}
            organizationName={org?.name}
          />

          <EditionPager prevEdition={siblings.prevEdition} nextEdition={siblings.nextEdition} />
        </div>
      </div>
    </>
  );
}

/** The white document sheet — one continuous editorial page, not a card grid. */
function EditionSheet({
  matters,
  meta,
  single,
}: {
  matters: SnapshotMatter[];
  meta: MatterMeta[];
  single?: boolean;
}) {
  return (
    <div className="edition-sheet overflow-hidden rounded-2xl bg-edition-sheet shadow-[var(--edition-shadow)] ring-1 ring-[rgba(15,23,42,0.06)]">
      <div
        className={`px-5 ${
          single ? "py-8 sm:px-9 sm:py-10 md:px-10 md:py-12" : "py-8 sm:px-9 sm:py-10 md:px-12"
        }`}
      >
        <article className={single ? "" : "space-y-14 lg:space-y-16"} aria-label="Publicações da edição">
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
      </div>
    </div>
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
