import type { MatterMeta } from "@/lib/edition-types";
import { kindCounts, matterKind, KIND_LABEL } from "@/lib/edition-catalog";

/**
 * "NESTA EDIÇÃO" — indexable summary of the edition. Pure server markup,
 * no JS needed to navigate (plain anchors with stable ids).
 */
export default function EditionSummary({ matters }: { matters: MatterMeta[] }) {
  const counts = kindCounts(matters);
  const kindsWithCount = counts.filter((c) => c.count > 0);

  return (
    <nav aria-label="Sumário da edição" className="edition-toc">
      <h2 className="text-label-md font-bold text-primary uppercase tracking-[0.2em] mb-1">
        Nesta edição
      </h2>
      <p className="text-label-md text-on-surface-variant mb-4" aria-live="polite">
        {matters.length} {matters.length === 1 ? "publicação" : "publicações"}
      </p>

      {kindsWithCount.length > 0 && (
        <ul className="space-y-1 mb-5 text-body-sm text-on-surface-variant">
          {kindsWithCount.map((c) => (
            <li key={c.key} className="flex justify-between gap-3 border-b border-outline-variant/50 pb-1">
              <span>{c.label}</span>
              <span className="font-semibold text-on-surface">{c.count}</span>
            </li>
          ))}
        </ul>
      )}

      <ol className="space-y-3">
        {matters.map((m) => {
          const kind = matterKind(m.title);
          return (
            <li key={m.anchorId} className="group">
              <a
                href={`#${m.anchorId}`}
                className="block"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-bold text-primary text-label-sm shrink-0">
                    {String(m.position + 1).padStart(2, "0")}
                  </span>
                  <span className="text-body-sm font-semibold text-on-surface uppercase leading-snug group-hover:text-primary group-hover:underline">
                    {m.title}
                  </span>
                </span>
                <span className="ml-6 flex flex-wrap gap-x-2 text-xs text-on-surface-variant">
                  <span className="uppercase tracking-wide">{KIND_LABEL[kind]}</span>
                  {m.section && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{m.section}</span>
                    </>
                  )}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
