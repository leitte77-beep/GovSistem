"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useMemo } from "react";
import { extensions } from "@/components/Editor/extensions";
import "@/app/editor-content.css";

export interface MatterContentPreviewProps {
  /** Canonical TipTap JSON when available (preferred). */
  contentJson?: Record<string, unknown> | null;
  /** Sanitized HTML snapshot, used as fallback when JSON is missing. */
  contentHtml?: string | null;
  /** True when the matter is a ready-made PDF (content is page images). */
  pdfMode?: boolean;
  className?: string;
}

/**
 * Read-only, full-fidelity render of a matter's content.
 *
 * Uses the SAME TipTap extension set as the editor (so tables, headers,
 * alignments, images, links and the signature block are never discarded) with
 * `editable: false`. Loads `content_json` when present and falls back to the
 * sanitized `content_html` snapshot otherwise.
 */
export default function MatterContentPreview({
  contentJson,
  contentHtml,
  pdfMode,
  className,
}: MatterContentPreviewProps) {
  const initialContent = useMemo(() => {
    if (pdfMode) {
      // PDF mode: render the embedded page images as-is.
      return contentHtml || "<p></p>";
    }
    if (contentJson && typeof contentJson === "object") {
      return contentJson;
    }
    return contentHtml || "<p></p>";
  }, [contentJson, contentHtml, pdfMode]);

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: false,
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none px-5 py-4" },
    },
  });

  if (!editor) {
    return (
      <div className="px-5 py-4 text-sm text-on-surface-variant">
        Carregando conteúdo…
      </div>
    );
  }

  return (
    <div
      className={className ?? "bg-white rounded-xl border border-outline-variant overflow-x-auto"}
      data-testid="matter-content-preview"
    >
      <EditorContent editor={editor} />
    </div>
  );
}
