"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { type EditorView } from "@tiptap/pm/view";
import { type Content } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { extensions } from "./extensions";
import Toolbar from "./Toolbar";
import { stripWordMso } from "@/lib/sanitize";
import { autoformatHtml, plainTextToStructuredHtml } from "@/lib/contentAutoformat";
import { formatOfficialAct } from "@/lib/officialActFormat";
import { cleanPastedHtml, detectPdfExtractedText, htmlLacksFormatting } from "@/lib/clipboard";
import { api } from "@/lib/api";
import type { AiComposeResult } from "@/types/document_model";
import HtmlPreview from "../Matter/HtmlPreview";
import "@/app/editor-content.css";

interface EditorProps {
  content: string;
  contentJson?: Record<string, unknown> | null;
  onChange: (html: string) => void;
  onChangeJson?: (json: Record<string, unknown>) => void;
  onCleanWarnings?: (warnings: string[]) => void;
  /**
   * Reports the raw clipboard source (HTML and/or plain text) for EVERY paste,
   * including Word/Excel/browser HTML. This is what lets the canonical semantic
   * engine classify rich content instead of only plain text.
   */
  onPasteSource?: (source: { html: string; plain: string; isOffice: boolean }) => void;
  aiContext?: {
    actType?: string;
    title?: string;
    summary?: string;
  };
  onAiCompose?: (result: AiComposeResult) => void;
}

/**
 * Pure extraction of a paste payload. Kept separate from the TipTap handler so
 * the "rich HTML must reach the semantic engine" behavior is unit-testable.
 * Returns null when the clipboard carries neither HTML nor text.
 */
export function extractPasteSource(getData: (type: string) => string): {
  html: string;
  plain: string;
  isOffice: boolean;
} | null {
  const html = getData("text/html") || "";
  const plain = getData("text/plain") || "";
  if (!html && !plain) return null;
  const isOffice = !!html && (
    /mso-|Mso|class="[^"]*Mso/i.test(html)
    || /<table[^>]*(?:xmlns|x:)/i.test(html)
  );
  return { html, plain, isOffice };
}

function insertHtml(view: EditorView, html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  const schema = view.state.schema;
  const slice = ProseMirrorDOMParser.fromSchema(schema).parseSlice(element);
  view.focus();
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
}


export default function Editor({
  content,
  contentJson,
  onChange,
  onChangeJson,
  onCleanWarnings,
  onPasteSource,
  aiContext,
  onAiCompose,
}: EditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "a4">("edit");
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingPdfText, setPendingPdfText] = useState<string | null>(null);
  const [pdfReasons, setPdfReasons] = useState<string[]>([]);
  const isInternalUpdate = useRef(false);
  const [a4Html, setA4Html] = useState<string>("");

  const initialContent: Content = contentJson && typeof contentJson === "object"
    ? (contentJson as Content)
    : (content || "<p></p>");

  const editor = useEditor({
    extensions,
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[360px] px-5 py-4",
      },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;

        const paste = extractPasteSource((type) => clipboard.getData(type));
        if (!paste) return false;
        event.preventDefault();

        const { html, plain: text, isOffice: isOfficeHtml } = paste;

        // PDF viewers (Adobe Acrobat, browser PDF preview) put text/html on
        // the clipboard alongside text/plain, but that HTML has no real
        // formatting — treat it like a plain-text paste so PDF-detection /
        // official-act formatting still runs, instead of falling into the
        // "rich HTML" branch below and leaving the pasted text unformatted.
        if (html && !isOfficeHtml && text.trim() && htmlLacksFormatting(html)) {
          onPasteSource?.({ html: "", plain: text, isOffice: false });
          const detected = detectPdfExtractedText(text);
          if (detected.likely) {
            setPendingPdfText(text);
            setPdfReasons(detected.reasons);
            return true;
          }
          insertHtml(view, formatOfficialAct(text));
          return true;
        }

        // 1) Prefer rich HTML when available — never flatten it to plain text.
        if (html) {
          // Rich HTML (Word/Excel/browser) is reported so the canonical semantic
          // engine can classify it — the old flow only did this for plain text.
          onPasteSource?.({ html, plain: text, isOffice: isOfficeHtml });
          const source = isOfficeHtml ? stripWordMso(html) : html;
          const { html: clean, warnings, preservedTables } = cleanPastedHtml(source);
          const contentToInsert = clean && /<(p|table|div|h[1-6]|ul|ol|blockquote|img)[\s>]/i.test(clean)
            ? clean
            : autoformatHtml(clean);

          insertHtml(view, contentToInsert);

          const w: string[] = [];
          if (/mso-|Mso/i.test(html)) w.push("Formatação Word limpa");
          if (/<table[\s>]/i.test(html)) w.push(preservedTables ? "Tabela preservada" : "Tabela normalizada");
          if (warnings.length) w.push(...warnings);
          if (w.length) onCleanWarnings?.(w);
          return true;
        }

          // 2) No HTML — only plain text. Detect PDF-extracted text.
          if (text) {
            const detected = detectPdfExtractedText(text);
            if (detected.likely) {
              setPendingPdfText(text);
              setPdfReasons(detected.reasons);
              return true; // ask the user before touching legal content
            }
            // Plain legal text also goes to the semantic engine (its parser is
            // richer than the local formatter); it is still inserted so the rich
            // editor keeps a visible fallback.
            onPasteSource?.({ html: "", plain: text, isOffice: false });
            // Official-act formatter recognizes preamble, SÚMULA/EMENTA,
            // DECRETA/RESOLVE, articles, incisos, CONSIDERANDO, place/date and
            // signature, and rebuilds tab-separated tables as real tables.
            insertHtml(view, formatOfficialAct(text));
            return true;
          }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
      onChangeJson?.(editor.getJSON());
    },
  });

  // Debounced A4 snapshot (kept in sync so preview reflects latest edits).
  useEffect(() => {
    if (!editor || viewMode !== "a4") return;
    const timer = setTimeout(() => setA4Html(editor.getHTML()), 400);
    return () => clearTimeout(timer);
  }, [editor, viewMode, a4Html === "" ? undefined : content]);

  // Sync external content changes into the editor (e.g. loading a matter).
  // Skips sync when the update originated inside the editor, and never
  // overwrites a loaded document with a late empty initialization.
  useEffect(() => {
    if (!editor || !content && !contentJson) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const current = editor.getHTML();
    const target = contentJson && typeof contentJson === "object"
      ? JSON.stringify(editor.getJSON()) !== JSON.stringify(contentJson)
      : content !== current;
    if (target) {
      const next: Content = contentJson && typeof contentJson === "object"
        ? (contentJson as Content)
        : (content || "<p></p>");
      editor.commands.setContent(next, false);
    }
  }, [content, contentJson, editor]);

  if (!editor) return null;

  const handleAutoFormat = () => {
    const structured = plainTextToStructuredHtml(editor.getText({ blockSeparator: "\n" }));
    editor.commands.setContent(structured, false);
    onChange(structured);
    onChangeJson?.(editor.getJSON());
  };

  const handleOfficialFormat = () => {
    const structured = formatOfficialAct(editor.getText({ blockSeparator: "\n" }));
    editor.commands.setContent(structured, false);
    onChange(structured);
    onChangeJson?.(editor.getJSON());
  };

  const handleAiFormat = async () => {
    setAiBusy(true);
    try {
      const prompt = editor.getText({ blockSeparator: "\n" }).trim();
      if (!prompt) {
        onCleanWarnings?.(["Descreva a matéria no editor antes de usar o robô."]);
        return;
      }
      const result = await api.aiCompose({ prompt });
      editor.commands.setContent(result.content_html, false);
      onChange(result.content_html);
      onChangeJson?.(editor.getJSON());
      onAiCompose?.(result);
      const validationNotice = result.matched_model.status !== "active"
        ? " Modelo ainda em validação: revise a minuta e aprove o modelo antes de publicar."
        : "";
      onCleanWarnings?.([
        (result.pending.length
          ? `Modelo ${result.matched_model.name} aplicado. Revise ${result.pending.length} campo(s) pendente(s).`
          : `Modelo ${result.matched_model.name} aplicado. Revise a minuta antes de salvar.`) + validationNotice,
      ]);
    } catch (err) {
      onCleanWarnings?.([
        err instanceof Error ? err.message : "Não foi possível montar a matéria com IA.",
      ]);
    } finally {
      setAiBusy(false);
    }
  };

  const applyPendingPdfChoice = (choice: "text" | "act" | "cancel") => {
    const text = pendingPdfText;
    setPendingPdfText(null);
    setPdfReasons([]);
    if (!text) return;
    if (choice === "cancel") {
      onCleanWarnings?.(["Para fidelidade absoluta, use 'Usar PDF pronto' (upload do arquivo original)."]);
      return;
    }
    const html = choice === "act" ? formatOfficialAct(text) : plainTextToStructuredHtml(text);
    editor.commands.setContent(html, false);
    onChange(html);
    onChangeJson?.(editor.getJSON());
  };

  return (
    <div className="min-h-[400px]">
      <Toolbar
        editor={editor}
        onPreview={() => setShowPreview(true)}
        onAutoFormat={handleAutoFormat}
        onOfficialFormat={handleOfficialFormat}
        onAiFormat={handleAiFormat}
        onToggleA4={() => setViewMode((m) => (m === "edit" ? "a4" : "edit"))}
        viewMode={viewMode}
        aiBusy={aiBusy}
      />

      {viewMode === "a4" ? (
        <A4Preview html={a4Html || editor.getHTML()} />
      ) : (
        <EditorContent editor={editor} />
      )}

      {/* PDF-text paste decision dialog */}
      {pendingPdfText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="font-semibold text-lg text-on-surface mb-1">
              Texto aparentemente extraído de PDF
            </h3>
            <p className="text-sm text-on-surface-variant mb-4">
              O clipboard continha apenas texto simples. Detecção: {pdfReasons.join("; ") || "padrão de PDF"}.
            </p>
            <p className="text-xs text-on-surface-variant mb-4">
              Nenhum conteúdo será alterado sem a sua confirmação.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => applyPendingPdfChoice("text")}
                className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface text-left hover:bg-surface-container-low"
              >
                Colar como texto
              </button>
              <button
                type="button"
                onClick={() => applyPendingPdfChoice("act")}
                className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary text-left hover:bg-primary-fixed/20"
              >
                Aplicar formatação de ato oficial
              </button>
              <button
                type="button"
                onClick={() => applyPendingPdfChoice("cancel")}
                className="rounded-lg border border-error/30 px-4 py-2 text-sm font-medium text-on-error-container text-left hover:bg-error-container/20"
              >
                Cancelar e enviar o PDF original
              </button>
            </div>
          </div>
        </div>
      )}

      <HtmlPreview open={showPreview} onClose={() => setShowPreview(false)} html={editor.getHTML()} />
    </div>
  );
}

function A4Preview({ html }: { html: string }) {
  return (
    <div className="mt-4 flex justify-center bg-surface-container-low/60 py-6 rounded-xl overflow-x-auto">
      <div
        className="editor-a4-page bg-white shadow-lg"
        style={{
          width: "210mm",
          minHeight: "297mm",
          maxWidth: "100%",
          padding: "20mm 18mm",
          boxSizing: "border-box",
        }}
        data-testid="a4-preview"
      >
        <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
