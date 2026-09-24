import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import type {
  EditionSnapshotPayload,
  SnapshotEdition,
  LegacyEditionPayload,
  SnapshotMatter,
  MatterMeta,
} from "@/lib/edition-types";
import { matterHref, slugify } from "@/lib/edition-catalog";
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

type PageProps = { params: Promise<{ ano: string; numero: string }> };

function formatCnpj(value?: string | null): string | null {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length !== 14) return value?.trim() || null;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

type MatterRelation = NonNullable<SnapshotMatter["relations"]>[number];

/** The "other" side of a relation, resolved to its canonical public URL. */
function relationOther(rel: MatterRelation): { href: string; title: string } {
  const outgoing = rel.direction === "outgoing";
  const title = (outgoing ? rel.target_title : rel.source_title) || "publicação relacionada";
  return {
    href: matterHref({
      id: outgoing ? rel.target_matter_id : rel.source_matter_id,
      slug: outgoing ? rel.target_slug : rel.source_slug,
    }),
    title,
  };
}

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
      slug: m?.slug ?? null,
      position: it?.position ?? index,
      section_title: it?.section_title ?? m?.section_title ?? null,
      title: title,
      summary: m?.summary ?? null,
      content_html: m?.content_html ?? "",
      // The semantic renderer owns title/súmula placement; without this flag the
      // page would print it a second time above the rendered document.
      has_semantic_content: Boolean(m?.has_semantic_content),
      attachments: m?.attachments ?? [],
      // Relação viva (retificação/substituição) que nunca altera o snapshot.
      publication_type: m?.publication_type ?? it?.publication_type ?? null,
      references_matter_id: m?.references_matter_id ?? it?.references_matter_id ?? null,
      relations: m?.relations ?? it?.relations ?? [],
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
  const { ano, numero } = await params;
  const year = Number(ano);
  const number = Number(numero);
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
  const { ano, numero } = await params;
  const year = Number(ano);
  const number = Number(numero);
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
        <div className={`${shell} py-8`}>
          {/* ===== Context + actions bar ===== */}
          <div className="mx-auto w-full max-w-[1480px]">
            <div className="relative overflow-visible rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_30px_rgba(15,42,82,0.07)] no-print">
              <div aria-hidden="true" className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-gradient-to-r from-brand-900 via-brand-accent to-amber-400" />
              <div className="flex flex-col gap-4 px-4 pb-4 pt-5 sm:px-5 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6 md:py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-900 sm:flex">
                    <span className="material-symbols-outlined text-[20px]">article</span>
                  </span>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Você está consultando
                    </p>
                    <EditionBreadcrumb year={year} number={number} />
                  </div>
                </div>
                <div className="shrink-0 border-t border-slate-100 pt-3 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                  <EditionActions
                    downloadUrl={downloadUrl}
                    viewUrl={viewUrl}
                    verificationUrl={verificationUrl}
                    shareTitle={`Edição nº ${number}/${year} — Diário Oficial Eletrônico`}
                  />
                </div>
              </div>
            </div>

            {/* ===== Three-zone card grid: sumário | documento | dados técnicos ===== */}
            <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)_270px] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
              {/* LEFT — Sumário */}
              <aside
                aria-label="Sumário da edição"
                className="hidden no-print lg:sticky lg:top-24 lg:block"
              >
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-4">
                    <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-900">
                        <span className="material-symbols-outlined text-[16px]">toc</span>
                      </span>
                      Sumário
                    </h2>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-inset ring-slate-200">
                      {meta.length} {meta.length === 1 ? "item" : "itens"}
                    </span>
                  </div>
                  <div className="doe-side-scroll p-2.5">
                    <ol className="space-y-1">
                      {meta.map((m, index) => (
                        <li key={m.anchorId}>
                          <a
                            href={`#${m.anchorId}`}
                            className="group flex items-start gap-3 rounded-xl border border-transparent px-2.5 py-2.5 transition hover:border-brand-100 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-accent"
                          >
                            <span className="mt-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-brand-900 px-1.5 text-[11px] font-bold text-white shadow-sm transition group-hover:bg-brand-accent">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="min-w-0 py-0.5">
                              {m.section && (
                                <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  {m.section}
                                </span>
                              )}
                              <span className="line-clamp-2 block text-[12px] font-semibold leading-[1.35] text-slate-700 group-hover:text-brand-900">
                                {m.title}
                              </span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </aside>

              {/* CENTER — Official document sheet */}
              <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#0b192c] via-blue-600 to-amber-500"
                />

                <div className="px-6 py-8 sm:px-10 sm:py-12">
                  {/* Masthead — center */}
                  <header className="border-b border-slate-200 pb-8 text-center">
                    <h1 className="sr-only">
                      {`Edição nº ${editionMeta.number} de ${headerDate} — Diário Oficial Eletrônico de ${municipality}`}
                    </h1>
                    {logo && (
                      <Image
                        alt={org?.name ? `Brasão de ${org.name}` : "Brasão do município"}
                        src={logo}
                        width={80}
                        height={80}
                        priority
                        className="mx-auto h-20 w-auto"
                      />
                    )}
                    <div className="mt-3 space-y-1">
                      <p className="text-2xl font-extrabold uppercase tracking-tight text-[#0b192c] sm:text-3xl">
                        Diário Oficial Eletrônico
                      </p>
                      <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-600">
                        {municipality}
                      </p>
                    </div>
                    <div className="mt-6 flex flex-wrap items-stretch justify-center gap-3 border-t border-slate-100 pt-5">
                      <span className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-4 py-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-brand-accent">filter_alt</span>
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Edição nº</span>
                        <span className="text-[15px] font-extrabold text-brand-900">{editionMeta.number}</span>
                      </span>
                      <span className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-4 py-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-brand-accent">calendar_month</span>
                        <span className="text-[15px] font-extrabold tracking-wide text-brand-900">{headerDate}</span>
                      </span>
                      <span className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-4 py-2">
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-brand-accent">article</span>
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Publicações</span>
                        <span className="text-[15px] font-extrabold text-brand-900">{totalPages}</span>
                      </span>
                    </div>
                  </header>

                  {/* Digital signature banner (green) */}
                  <div className="my-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm text-white">
                        <span className="material-symbols-outlined text-[18px]">check</span>
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-emerald-800">
                          Assinado digitalmente por {municipality}
                        </p>
                        {code && (
                          <p className="font-mono text-xs font-bold text-emerald-900">{code}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {hasMatters ? (
                    <>
                      {/* Mobile-only SUMÁRIO band */}
                      <section aria-label="Sumário da edição" className="mt-7 lg:hidden">
                        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-[#102a43]">toc</span>
                          Sumário
                        </h2>
                        <ol className="mt-3 space-y-2">
                          {meta.map((m, index) => (
                            <li key={m.anchorId}>
                              <a
                                href={`#${m.anchorId}`}
                                className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[14px] font-medium text-[#102a43] transition hover:bg-blue-100"
                              >
                                <span className="min-w-0 truncate">{m.title}</span>
                                <span className="shrink-0 rounded-md bg-[#0b192c] px-2 py-0.5 text-xs font-bold text-white">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ol>
                      </section>

                      {/* Matters — official documents */}
                      <div className="mt-8 space-y-10">
                        {matters.map((m, index) => {
                          const anchorId = meta[index].anchorId;
                          const relations = (m.relations ?? []).filter(
                            (r) => r.relation_type === "rectifies" || r.relation_type === "supersedes",
                          );
                          const isRectification = m.publication_type === "rectification";
                          const showRectificationNote = isRectification && relations.length === 0;
                          return (
                            <div key={anchorId}>
                              {(showRectificationNote || relations.length > 0) && (
                                <div
                                  className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
                                  role="note"
                                >
                                  {showRectificationNote && (
                                    <span>
                                      <strong>Retificação</strong>
                                      {m.references_matter_id
                                        ? " de publicação anterior."
                                        : "."}
                                    </span>
                                  )}
                                  {relations.map((r) => {
                                    const other = relationOther(r);
                                    return (
                                      <span key={r.id} className={showRectificationNote ? "ml-2" : ""}>
                                        {r.direction === "incoming" ? (
                                          <>
                                            Esta publicação foi {r.label.toLowerCase()} por{" "}
                                            <Link href={other.href} className="font-semibold underline hover:text-amber-950">
                                              {other.title}
                                            </Link>
                                            .
                                          </>
                                        ) : (
                                          <>
                                            Esta publicação {r.label.toLowerCase()}{" "}
                                            <Link href={other.href} className="font-semibold underline hover:text-amber-950">
                                              {other.title}
                                            </Link>
                                            .
                                          </>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            <MatterDocument
                              matter={m}
                              anchorId={anchorId}
                              href={matterHref(m)}
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
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <EmptyEdition downloadUrl={downloadUrl} />
                  )}

                  {/* Mobile-only Validação do Documento */}
                  {code && (
                    <section className="mt-10 lg:hidden" aria-label="Validação do Documento">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#102a43]">
                        Validação do Documento
                      </h3>
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Código de verificação
                        </p>
                        <span className="mt-1 block font-mono text-[13px] text-slate-700">{code}</span>
                        {verificationUrl && (
                          <a className="mt-2 block text-[12px] font-medium text-[#0066cc] underline" href={verificationUrl}>
                            Verifique em {verificationUrl}
                          </a>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Page footer */}
                  <div className="mt-10 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
                    Diário Oficial Eletrônico — Edição nº {editionMeta.number} · {formatLongDatePT(publicationDate) || `Ano de ${editionMeta.year}`}
                  </div>
                </div>
              </section>

              {/* RIGHT — Dados técnicos */}
              <aside
                aria-label="Dados técnicos da edição"
                className="hidden no-print lg:sticky lg:top-24 lg:block"
              >
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-[#102a43]">verified_user</span>
                      Dados técnicos
                    </h2>
                  </div>
                  <div className="doe-side-scroll space-y-5 p-5 text-xs">
                    {authenticity && (
                      <div className="space-y-1 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                        <p className="flex items-center gap-2 text-[13px] font-bold text-emerald-700">
                          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">verified_user</span>
                          Publicação oficial
                        </p>
                        {authenticity.signatures?.[0]?.signed_at && (
                          <p className="text-slate-600">
                            Assinada digitalmente em {formatBrasiliaDateTime(authenticity.signatures[0].signed_at)}
                          </p>
                        )}
                      </div>
                    )}

                    {code && (
                      <div className="space-y-1.5">
                        <p className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                          Código de verificação
                        </p>
                        <div className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-[13px] text-slate-700">
                          {code}
                        </div>
                        {verificationUrl && (
                          <p className="pt-0.5 text-[11px] text-slate-500">
                            Verifique em <span className="font-medium text-[#0066cc] underline">{verificationUrl}</span>
                          </p>
                        )}
                      </div>
                    )}

                    {authenticity && (
                      <div className="space-y-2">
                        <p className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                          Autenticidade técnica
                        </p>
                        <ul className="space-y-2">
                          {buildAuthenticityRows(authenticity.states).map((r) => (
                            <li
                              key={r.key}
                              className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                            >
                              <span className="text-slate-600">{r.label}</span>
                              <span
                                className={`flex shrink-0 items-center gap-1 font-bold ${
                                  r.tone === "ok" ? "text-emerald-600" : r.tone === "warn" ? "text-amber-600" : "text-slate-500"
                                }`}
                              >
                                {r.tone === "ok" && (
                                  <span aria-hidden="true" className="material-symbols-outlined text-[15px]">check_circle</span>
                                )}
                                {r.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {authenticity?.signatures?.[0]?.subject && (
                      <div className="space-y-1.5">
                        <p className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                          Signatário
                        </p>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="font-bold uppercase text-slate-800">{municipality}</p>
                          {formatCnpj(authenticity.signatures[0].certificate_document) && (
                            <p className="mt-1 text-slate-500">
                              CNPJ {formatCnpj(authenticity.signatures[0].certificate_document)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {authenticity?.signed_pdf_hash && (
                      <div className="space-y-1.5">
                        <p className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                          SHA-256 do PDF assinado
                        </p>
                        <div className="select-all break-all rounded-lg bg-slate-50 p-2.5 font-mono text-[10px] text-slate-500">
                          {authenticity.signed_pdf_hash}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>

            <EditionPager prevEdition={siblings.prevEdition} nextEdition={siblings.nextEdition} />
          </div>
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
