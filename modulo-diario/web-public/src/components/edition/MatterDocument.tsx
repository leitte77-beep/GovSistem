import type { SnapshotMatter } from "@/lib/edition-types";
import CopyMatterLink from "./CopyMatterLink";

export type MatterDocumentProps = {
  matter: SnapshotMatter;
  anchorId: string;
  position: number;
  last?: boolean;
  prevLink?: { anchorId: string; title: string };
  nextLink?: { anchorId: string; title: string };
};

/** Demote any inner h1 -> h2 so the page keeps exactly one <h1>. */
function demoteHeadings(html: string): string {
  return html
    .replace(/<h1([^>]*)>/gi, "<h2$1>")
    .replace(/<\/h1>/gi, "</h2>")
    .replace(/<h3([^>]*)>/gi, "<h4$1>")
    .replace(/<\/h3>/gi, "</h4>");
}

/**
 * Wraps raw <table> elements so they can scroll horizontally on small
 * screens without clipping or hiding any column. Pure presentation — the
 * official HTML/text is never rewritten.
 */
function wrapTables(html: string): string {
  return html.replace(
    /<table[\s\S]*?<\/table>/gi,
    (table) => `<div class="table-scroll">${table}</div>`,
  );
}

function prepareContent(html: string): string {
  return wrapTables(demoteHeadings(html));
}

/**
 * Renders one official matter as part of the edition document. Presentation
 * is refined and typographic, but the original official content is never
 * altered or reorganised.
 */
export default function MatterDocument({
  matter,
  anchorId,
  position,
  prevLink,
  nextLink,
}: MatterDocumentProps) {
  const kindLabel = titleKindLabel(matter.title);
  const showNav = Boolean(prevLink || nextLink);

  return (
    <section
      id={anchorId}
      data-mid={anchorId}
      className="matter scroll-mt-[7.5rem]"
    >
      {/* overline: discreet act-type + share */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-edition-accent">
          {kindLabel || matter.section_title || `Publicação ${String(position + 1).padStart(2, "0")}`}
        </p>
        <span className="shrink-0 no-print">
          <CopyMatterLink anchorId={anchorId} />
        </span>
      </div>

      {/* document heading */}
      <h2 className="text-[26px] font-extrabold uppercase leading-[1.15] tracking-tight text-edition-ink sm:text-[30px] lg:text-[34px]">
        {matter.title}
      </h2>

      {matter.summary && (
        <div className="mt-5 border-l-[3px] border-[var(--doe-accent,var(--edition-accent))] pl-4 sm:pl-5">
          <p className="text-[16px] font-medium leading-relaxed text-edition-ink-2 sm:text-[18px] sm:leading-[1.7]">
            {matter.summary}
          </p>
        </div>
      )}

      <hr className="my-7 border-0 border-t border-edition-line-strong" aria-hidden="true" />

      <div
        className="matter-body"
        dangerouslySetInnerHTML={{ __html: prepareContent(matter.content_html || "") }}
      />

      {matter.attachments && matter.attachments.length > 0 && (
        <div className="mt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-edition-muted">Anexos</p>
          <ul className="mt-3 space-y-1.5">
            {matter.attachments.map((a, i) => (
              <li key={a.id || i} className="flex items-center gap-2 text-[15px] text-edition-ink">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-edition-accent">
                  attach_file
                </span>
                {a.title || a.filename || "Anexo"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNav && (
        <nav
          aria-label={`Navegação entre publicações — ${matter.title}`}
          className="no-print mt-14 grid gap-4 border-t border-edition-line pt-7 sm:grid-cols-2"
        >
          {prevLink ? (
            <a
              href={`#${prevLink.anchorId}`}
              className="group flex items-start gap-2 rounded-xl p-2 -m-2"
            >
              <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-edition-muted">chevron_left</span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-edition-muted">
                  Matéria anterior
                </span>
                <span className="block truncate text-[14px] font-semibold text-edition-ink group-hover:text-[var(--edition-accent)]">
                  {prevLink.title}
                </span>
              </span>
            </a>
          ) : (
            <span aria-hidden="true" />
          )}

          {nextLink ? (
            <a
              href={`#${nextLink.anchorId}`}
              className="group flex items-start justify-end gap-2 rounded-xl p-2 -m-2 text-right sm:justify-start sm:flex-row-reverse sm:text-left"
            >
              <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-edition-muted">chevron_right</span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-edition-muted">
                  Próxima matéria
                </span>
                <span className="block truncate text-[14px] font-semibold text-edition-ink group-hover:text-[var(--edition-accent)]">
                  {nextLink.title}
                </span>
              </span>
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
