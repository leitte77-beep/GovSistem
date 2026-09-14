"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  DocumentLayout,
  DocumentModelConfig,
  DocumentSection,
  InstitutionalProfile,
} from "@/types/document_model";
import { SECTION_KIND_LABEL } from "./constants";

interface Props {
  config: DocumentModelConfig;
  layout: DocumentLayout;
  institution?: InstitutionalProfile | null;
  selectedId: string | null;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onAction: (
    id: string,
    action: "up" | "down" | "duplicate" | "delete"
  ) => void;
  onReorder: (dragId: string, targetId: string) => void;
}

const MARKER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Renderiza um texto trocando {{campo}} por chips visuais (sem digitar JSON). */
function RichText({ text, align }: { text: string; align?: string }) {
  if (!text) {
    return <span className="text-gray-300 italic">(texto vazio)</span>;
  }
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MARKER_RE);
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <span
        key={`m-${i}`}
        className="mx-0.5 inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[0.78em] font-medium text-blue-700 ring-1 ring-blue-200"
        title="Campo dinâmico"
      >
        {match[1]}
      </span>
    );
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <span style={{ textAlign: (align as CSSProperties["textAlign"]) || "justify" }}>
      {parts}
    </span>
  );
}

function SectionBody({ section }: { section: DocumentSection }) {
  switch (section.kind) {
    case "command":
      return (
        <p className="font-semibold" style={{ textAlign: "center" }}>
          <RichText text={section.text ?? ""} align="center" />
        </p>
      );
    case "signature_block":
      return (
        <div className="mt-6 space-y-3">
          {(section.entries ?? []).map((e, idx) => {
            const pos = e.position ?? section.alignment ?? "center";
            const lineMargin =
              pos === "left"
                ? "0 auto 0.25rem 0"
                : pos === "right"
                  ? "0 0 0.25rem auto"
                  : "0 auto 0.25rem";
            return (
              <div key={idx} style={{ textAlign: pos as "left" | "center" | "right" }}>
                <div className="w-64 border-t border-gray-400" style={{ margin: lineMargin }} />
                <div className="font-semibold uppercase">{e.name || "NOME DA AUTORIDADE"}</div>
                <div className="text-[0.9em]">{e.role || "Cargo"}</div>
              </div>
            );
          })}
        </div>
      );
    default:
      return <RichText text={section.text ?? ""} align={section.alignment} />;
  }
}

function SectionNode({
  section,
  depth,
  articleNumber,
  selectedId,
  readOnly,
  dragId,
  dragOverId,
  onSelect,
  onAction,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  section: DocumentSection;
  depth: number;
  articleNumber?: number;
  selectedId: string | null;
  readOnly?: boolean;
  dragId: string | null;
  dragOverId: string | null;
  onSelect: (id: string) => void;
  onAction: Props["onAction"];
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  const selected = selectedId === section.id;
  const conditional = Boolean(section.when_field);
  const isArticle = section.kind === "article";
  const isDragging = dragId === section.id;
  const isDropTarget = dragOverId === section.id && dragId !== section.id;

  return (
    <div
      draggable={!readOnly}
      onDragStart={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", section.id);
        onDragStart(section.id);
      }}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        onDragOver(section.id);
      }}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        onDrop(section.id);
      }}
      className={`group relative -mx-2 rounded px-2 py-1 transition ${
        selected ? "bg-blue-50/70 ring-1 ring-blue-300" : "hover:bg-gray-50"
      } ${isDragging ? "opacity-50" : ""} ${
        isDropTarget ? "ring-2 ring-blue-400" : ""
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(section.id);
      }}
    >
      <div className="absolute -top-3 right-0 z-10 hidden items-center gap-1 rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-sm group-hover:flex">
        {!readOnly && (
          <span
            className="mr-0.5 cursor-grab text-gray-400"
            title="Arraste para reordenar"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
          </span>
        )}
        {conditional && (
          <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            SE {section.when_field} = {section.when_value}
          </span>
        )}
        {!readOnly && (
          <>
            <button
              type="button"
              aria-label="Mover para cima"
              className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
              onClick={(e) => {
                e.stopPropagation();
                onAction(section.id, "up");
              }}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
            </button>
            <button
              type="button"
              aria-label="Mover para baixo"
              className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
              onClick={(e) => {
                e.stopPropagation();
                onAction(section.id, "down");
              }}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
            </button>
            <button
              type="button"
              aria-label="Duplicar"
              className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
              onClick={(e) => {
                e.stopPropagation();
                onAction(section.id, "duplicate");
              }}
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
            </button>
            <button
              type="button"
              aria-label="Excluir"
              className="rounded p-0.5 text-red-500 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                onAction(section.id, "delete");
              }}
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </>
        )}
      </div>

      <div style={{ marginLeft: depth * 16 }}>
        {(section.locked || section.fixed_text || section.ai_generated) && (
          <span className="mr-1 inline-flex translate-y-[1px] items-center gap-0.5 align-middle">
            {section.locked && (
              <span
                className="material-symbols-outlined text-[13px] text-red-500"
                title="Protegido (IA não altera)"
              >
                lock
              </span>
            )}
            {section.fixed_text && (
              <span
                className="material-symbols-outlined text-[13px] text-gray-500"
                title="Texto fixo"
              >
                push_pin
              </span>
            )}
            {section.ai_generated && (
              <span
                className="material-symbols-outlined text-[13px] text-purple-500"
                title="Gerado pela IA"
              >
                auto_awesome
              </span>
            )}
          </span>
        )}
        {isArticle && (
          <span className="mr-1 font-semibold">
            Art. {section.number || articleNumber}º
          </span>
        )}
        <SectionBody section={section} />
      </div>

      {section.children && section.children.length > 0 && (
        <div className="mt-1">
          {section.children.map((child) => (
            <SectionNode
              key={child.id}
              section={child}
              depth={depth + 1}
              selectedId={selectedId}
              readOnly={readOnly}
              dragId={dragId}
              dragOverId={dragOverId}
              onSelect={onSelect}
              onAction={onAction}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function A4Canvas({
  config,
  layout,
  institution,
  selectedId,
  readOnly,
  onSelect,
  onAction,
  onReorder,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const margins = layout.margins ?? { top: 20, right: 18, bottom: 20, left: 18 };
  const font = layout.body_font ?? {
    family: "Times New Roman",
    size: 12,
    line_height: 1.5,
    color: "#000000",
  };
  const header = layout.header;
  const footer = layout.footer;
  let articleCounter = 0;

  const addressLine = institution
    ? [
        institution.address_street,
        institution.address_number,
        institution.address_district,
        institution.address_city,
        institution.state,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="flex h-full min-h-0 justify-center overflow-auto bg-gray-200/60 p-6">
      <div
        data-testid="builder-a4"
        className="shadow-lg"
        style={{
          width: layout.orientation === "landscape" ? "297mm" : "210mm",
          minHeight: layout.orientation === "landscape" ? "210mm" : "297mm",
          background: layout.background_color || "#FFFFFF",
          paddingTop: `${margins.top}mm`,
          paddingRight: `${margins.right}mm`,
          paddingBottom: `${margins.bottom}mm`,
          paddingLeft: `${margins.left}mm`,
          fontFamily: font.family,
          fontSize: `${font.size}pt`,
          lineHeight: font.line_height,
          color: font.color,
        }}
        onClick={() => onSelect("")}
      >
        {header?.enabled && (
          <header
            className="mb-6 border-b border-gray-300 pb-3"
            style={{ textAlign: (header.alignment as CSSProperties["textAlign"]) || "center" }}
          >
            {header.show_coat_of_arms && (
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-gray-300 text-[10px] text-gray-400">
                BRASÃO
              </div>
            )}
            {header.show_institution_name && (
              <div className="text-[1.1em] font-bold uppercase">
                {institution?.name || "NOME DO MUNICÍPIO"}
              </div>
            )}
            {header.show_address && addressLine && <div className="text-[0.8em]">{addressLine}</div>}
            {header.show_cnpj && institution?.cnpj && (
              <div className="text-[0.8em]">CNPJ: {institution.cnpj}</div>
            )}
            {(header.show_phone || header.show_site) && (
              <div className="text-[0.8em]">
                {header.show_phone && institution?.phone ? `Tel: ${institution.phone}` : ""}
                {header.show_phone && header.show_site && institution?.phone && institution?.site
                  ? " · "
                  : ""}
                {header.show_site && institution?.site ? institution.site : ""}
              </div>
            )}
          </header>
        )}

        {config.document_title && (
          <h1 className="mb-2 text-center text-[1.15em] font-bold uppercase">
            {config.document_title}
          </h1>
        )}
        {config.summary && (
          <p className="mb-4 text-center italic">
            <RichText text={config.summary} align="center" />
          </p>
        )}

        {config.sections.length === 0 ? (
          <div className="mt-16 text-center text-gray-400">
            <span className="material-symbols-outlined text-4xl">article</span>
            <p className="mt-2 text-sm">
              Adicione elementos no painel esquerdo para montar o documento.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {config.sections.map((section) => {
              if (section.kind === "article") articleCounter += 1;
              return (
                <SectionNode
                  key={section.id}
                  section={section}
                  depth={0}
                  articleNumber={articleCounter}
                  selectedId={selectedId}
                  readOnly={readOnly}
                  dragId={dragId}
                  dragOverId={dragOverId}
                  onSelect={onSelect}
                  onAction={onAction}
                  onDragStart={setDragId}
                  onDragOver={setDragOverId}
                  onDrop={(targetId) => {
                    if (dragId && dragId !== targetId) onReorder(dragId, targetId);
                    setDragId(null);
                    setDragOverId(null);
                  }}
                />
              );
            })}
          </div>
        )}

        {footer?.enabled && (
          <footer
            className="mt-8 border-t border-gray-300 pt-2 text-[0.8em] text-gray-500"
            style={{
              textAlign: (footer.alignment as CSSProperties["textAlign"]) || "center",
            }}
          >
            {footer.custom_html || ""}
            {footer.show_page_numbers
              ? (footer.page_number_format || "Página {page} de {total}")
                  .replace("{page}", "1")
                  .replace("{total}", "1")
              : ""}
          </footer>
        )}
      </div>
    </div>
  );
}
