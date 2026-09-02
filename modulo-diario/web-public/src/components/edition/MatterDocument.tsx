import type { SnapshotMatter } from "@/lib/edition-types";
import CopyMatterLink from "./CopyMatterLink";

export type MatterDocumentProps = {
  matter: SnapshotMatter;
  anchorId: string;
  position: number;
  prevLink?: { anchorId: string; title: string };
  nextLink?: { anchorId: string; title: string };
};

/** Demote any inner h1 -> h2 so the page keeps exactly one <h1>. */
function demoteHeadings(html: string): string {
  return html.replace(/<h1([^>]*)>/gi, "<h2$1>").replace(/<\/h1>/gi, "</h2>");
}

/**
 * Renders one official matter as a document (server-side, indexable).
 * Presentation is improved but the original HTML content is never rewritten.
 */
export default function MatterDocument({
  matter,
  anchorId,
  position,
  prevLink,
  nextLink,
}: MatterDocumentProps) {
  const kindLabel = titleKindLabel(matter.title);
  return (
    <section
      id={anchorId}
      data-mid={anchorId}
      className="matter scroll-mt-28 border-t-2 border-surface-container-highest pt-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {kindLabel && (
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-surface-container-high text-on-surface-variant border border-outline-variant">
              {kindLabel}
            </span>
          )}
          <span className="text-label-md text-on-surface-variant uppercase">
            {String(position + 1).padStart(2, "0")} · {matter.section_title || "Publicação"}
          </span>
        </div>
        <span className="no-print">
          <CopyMatterLink anchorId={anchorId} />
        </span>
      </div>

      <h2 className="font-bold text-primary text-body-lg md:text-headline-sm uppercase leading-tight mb-2">
        {matter.title}
      </h2>
      {matter.summary && (
        <p className="text-body-md font-semibold text-on-surface max-w-3xl leading-relaxed mb-5 border-l-2 border-primary-container pl-4">
          {matter.summary}
        </p>
      )}

      <div
        className="prose max-w-none text-on-surface prose-p:my-3 prose-p:text-justify prose-p:text-body-md prose-p:leading-relaxed prose-strong:font-bold prose-headings:text-center prose-headings:uppercase prose-table:w-full prose-th:bg-surface-container-low prose-td:border prose-th:border prose-td:border-outline-variant"
        dangerouslySetInnerHTML={{ __html: demoteHeadings(matter.content_html || "") }}
      />

      {matter.attachments && matter.attachments.length > 0 && (
        <div className="mt-6">
          <span className="text-label-md text-on-surface-variant uppercase">Anexos</span>
          <ul className="mt-2 space-y-1">
            {matter.attachments.map((a, i) => (
              <li key={a.id || i} className="flex items-center gap-2 text-body-sm text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined text-sm text-secondary">
                  attach_file
                </span>
                {a.title || a.filename || "Anexo"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(prevLink || nextLink) && (
        <nav
          aria-label={`Navegação entre publicações (${matter.title})`}
          className="mt-6 pt-4 border-t border-outline-variant/60 flex flex-wrap items-center justify-between gap-3 no-print"
        >
          {prevLink ? (
            <a href={`#${prevLink.anchorId}`} className="inline-flex items-center gap-1 text-body-sm font-bold text-primary hover:underline">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">chevron_left</span>
              <span className="max-w-[220px] truncate">{prevLink.title}</span>
            </a>
          ) : (
            <span aria-hidden="true" />
          )}
          <a href="#edition-summary" className="text-body-sm font-bold text-on-surface-variant hover:underline">
            Voltar ao sumário
          </a>
          {nextLink ? (
            <a href={`#${nextLink.anchorId}`} className="inline-flex items-center gap-1 text-body-sm font-bold text-primary hover:underline">
              <span className="max-w-[220px] truncate">{nextLink.title}</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">chevron_right</span>
            </a>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      )}
    </section>
  );
}

function titleKindLabel(title: string): string | null {
  const t = (title || "").toUpperCase().trim();
  const re = /^(LEI|DECRETO|PORTARIA|RESOLU[ÇC]|LICITA[ÇC]|CONTRATO|EXTRATO|ATA)\b/;
  return re.test(t) ? t.split(/\s/)[0].replace(/[^A-ZÇ]/g, "") : null;
}
