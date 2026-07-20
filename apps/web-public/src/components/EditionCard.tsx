"use client";

import Link from "next/link";
import { EditionSummary } from "@/lib/api";
import { formatSummary } from "@/lib/summary";
import { TYPE_LABELS, resolveEditionType } from "@/lib/edition-types";
import ShareDialog from "@/components/ShareDialog";

const TYPE_STYLES: Record<string, string> = {
  normal: "bg-secondary-container text-on-secondary-container",
  extra: "bg-primary-container text-on-primary-container",
  suplementar: "bg-tertiary-container text-on-tertiary-container",
};

const TYPE_ACCENT: Record<string, string> = {
  normal: "from-secondary via-secondary to-secondary-fixed-dim",
  extra: "from-primary via-primary-container to-primary-fixed-dim",
  suplementar: "from-tertiary via-tertiary-container to-tertiary-fixed-dim",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function EditionCard({
  edition,
  compact = false,
}: {
  edition: EditionSummary;
  compact?: boolean;
}) {
  const type = resolveEditionType(edition.type);
  const href = `/edicoes/${edition.year}/${edition.number}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[16px] border border-outline-variant bg-surface-container-lowest shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_40px_-12px_rgba(0,22,49,0.28)] focus-within:-translate-y-1 focus-within:border-primary/40 motion-reduce:transform-none motion-reduce:transition-none">
      <span
        aria-hidden="true"
        className={`h-1.5 w-full bg-gradient-to-r ${TYPE_ACCENT[type]}`}
      />

      <div
        className={`relative overflow-hidden bg-gradient-to-b from-surface-container-low/60 to-transparent ${compact ? "px-4 pb-3 pt-3" : "px-6 pb-5 pt-5"}`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -right-2 -top-4 select-none font-bold leading-none tabular-nums text-primary/[0.06] transition-transform duration-500 group-hover:scale-110 ${compact ? "text-[52px]" : "text-[86px]"}`}
        >
          {String(edition.number).padStart(2, "0")}
        </span>

        <div className="relative flex items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-[999px] px-2.5 py-1 text-[10px] font-bold tracking-wider ${TYPE_STYLES[type]}`}
          >
            <span className="h-1.5 w-1.5 rounded-[999px] bg-current" />
            {TYPE_LABELS[type]}
          </span>
          <time
            dateTime={edition.publication_date}
            className="text-label-md font-label-md text-on-surface-variant"
          >
            {formatDate(edition.publication_date)}
          </time>
        </div>

        <h3
          className={`relative leading-tight text-primary ${compact ? "mt-2 font-title-md text-title-md line-clamp-2" : "mt-3 font-headline-sm text-headline-sm"}`}
        >
          {edition.title}
        </h3>
      </div>

      <div className={`flex-grow ${compact ? "px-4 pb-3" : "px-6 pb-5"}`}>
        <div
          className={`flex items-center gap-2 font-label-md text-label-md uppercase tracking-widest text-on-surface-variant ${compact ? "mb-2" : "mb-3"}`}
        >
          <span className="h-px w-6 bg-secondary transition-all duration-300 group-hover:w-10" />
          Súmula do Dia
        </div>
        <div
          className={`relative rounded-xl border border-outline-variant/70 bg-surface-container-low/45 ${compact ? "min-h-[64px] px-3 py-2" : "min-h-[116px] px-4 py-3"}`}
        >
          <p
            className={`text-on-surface ${compact ? "font-body-sm text-body-sm leading-5" : "font-body-sm text-body-sm leading-7"}`}
            style={{
              display: "-webkit-box",
              WebkitLineClamp: compact ? 2 : 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {formatSummary(edition.daily_summary)}
          </p>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-xl bg-gradient-to-t from-surface-container-low to-transparent" />
        </div>

        <div
          className={`flex items-center gap-4 font-label-md text-label-md text-on-surface-variant ${compact ? "mt-2" : "mt-4"}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-secondary">
              description
            </span>
            {edition.item_count} {edition.item_count === 1 ? "matéria" : "matérias"}
          </span>
          {edition.signature_count > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary">
                verified
              </span>
              {compact ? "Assinada" : "Assinada digitalmente"}
            </span>
          )}
        </div>
      </div>

      <div
        className={`flex items-center justify-between border-t border-outline-variant/60 bg-surface-container-low/50 ${compact ? "p-3" : "p-4"}`}
      >
        <Link
          href={href}
          className={`inline-flex items-center gap-2 rounded-lg bg-primary text-on-primary transition-all hover:opacity-90 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${compact ? "px-3 py-1.5 font-label-sm text-label-sm" : "px-4 py-2 font-label-md text-label-md"}`}
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          Visualizar
          <span className="material-symbols-outlined text-[16px] transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none">
            arrow_forward
          </span>
        </Link>

        <div className="flex gap-1">
          {edition.pdf_url && (
            <a
              href={edition.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-primary"
              aria-label={`Baixar PDF da edição ${edition.number}`}
            >
              <span className="material-symbols-outlined">download</span>
            </a>
          )}
          <ShareDialog
            url={`${typeof window !== "undefined" ? window.location.origin : ""}${href}`}
            title={`Edição ${edition.number}/${edition.year} - Diário Oficial`}
            buttonClassName="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-primary"
          />
        </div>
      </div>
    </article>
  );
}
