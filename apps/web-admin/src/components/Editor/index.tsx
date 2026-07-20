"use client";

import { useEditor, EditorContent, type Editor as TipTapEditor } from "@tiptap/react";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { useEffect, useRef, useState } from "react";
import { extensions } from "./extensions";
import Toolbar from "./Toolbar";
import { stripWordMso } from "@/lib/sanitize";
import { autoformatHtml, plainTextToStructuredHtml } from "@/lib/contentAutoformat";
import { api } from "@/lib/api";
import HtmlPreview from "../Matter/HtmlPreview";

export interface GazetteDetection {
  title?: string;
  summary?: string;
  category?: string;
  template?: string;
  tocTitle?: string;
}

interface EditorProps {
  content: string;
  onChange: (html: string) => void;
  onCleanWarnings?: (warnings: string[]) => void;
  onAutoDetect?: (detected: GazetteDetection) => void;
  aiContext?: {
    actType?: string;
    title?: string;
    summary?: string;
  };
}

function hasTabularText(text: string): boolean {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .some((block) => block.split("\n").filter((line) => line.trim().length > 0).some((line) => line.includes("\t")));
}

function htmlLooksStructured(html: string): boolean {
  return /<(table|thead|tbody|tr|td|th|h[1-6]|ul|ol|blockquote|pre|img|figure)[\s>]/i.test(html);
}

function normalizePastedTables(html: string): string {
  if (typeof window === "undefined" || !/<table[\s>]/i.test(html)) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  for (const table of Array.from(doc.querySelectorAll("table"))) {
    const normalized = doc.createElement("table");
    const tbody = doc.createElement("tbody");

    for (const row of Array.from(table.querySelectorAll("tr"))) {
      const normalizedRow = doc.createElement("tr");
      const cells = Array.from(row.children).filter((child) => {
        const tagName = child.tagName.toLowerCase();
        return tagName === "td" || tagName === "th";
      });

      for (const cell of cells) {
        const normalizedCell = doc.createElement("td");
        const colspan = cell.getAttribute("colspan");
        const rowspan = cell.getAttribute("rowspan");

        if (colspan) normalizedCell.setAttribute("colspan", colspan);
        if (rowspan) normalizedCell.setAttribute("rowspan", rowspan);

        const content = cell.innerHTML.trim() || cell.textContent?.trim() || "<br>";
        normalizedCell.innerHTML = content.startsWith("<p") ? content : `<p>${content}</p>`;
        normalizedRow.appendChild(normalizedCell);
      }

      if (normalizedRow.children.length > 0) {
        tbody.appendChild(normalizedRow);
      }
    }

    if (tbody.children.length > 0) {
      normalized.appendChild(tbody);
      table.replaceWith(normalized);
    }
  }

  return doc.body.innerHTML;
}

export default function Editor({ content, onChange, onCleanWarnings, onAutoDetect, aiContext }: EditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [gazetteBusy, setGazetteBusy] = useState(false);
  const isInternalUpdate = useRef(false);
  const gazetteRequested = useRef(false);
  const editorRef = useRef<TipTapEditor | null>(null);

  const templateLabels: Record<string, string> = {
    "normative-act": "Ato normativo",
    "extract-fields": "Extrato em campos",
    "procurement": "Processo de compras",
    "admin-board": "Quadro administrativo",
    "generic": "Genérico",
  };

  const runGazetteParse = async ({ contentText, contentHtml }: { contentText?: string; contentHtml?: string }) => {
    setGazetteBusy(true);
    try {
      const result = await api.parseGazetteContent({
        content_text: contentText || undefined,
        content_html: contentHtml || undefined,
        use_ai: true,
      });
      if (result.success && result.rendered_html) {
        const current = editorRef.current;
        if (current) {
          isInternalUpdate.current = true;
          current.commands.setContent(result.rendered_html, false);
        }
        onChange(result.rendered_html);
        const summaryBlock = result.document.blocks.find((b) => b.type === "summary");
        onAutoDetect?.({
          title: result.document.title ?? undefined,
          summary: summaryBlock
            ? summaryBlock.original_text.replace(/^(S[ÚU]MULA|EMENTA)\s*:\s*/i, "").replace(/\n/g, " ")
            : undefined,
          category: result.document.category ?? undefined,
          template: result.document.template,
          tocTitle: result.toc.table_of_contents_title ?? undefined,
        });
        onCleanWarnings?.([
          `Diagramação automática: ${templateLabels[result.document.template] ?? result.document.template}`,
          ...result.warnings,
        ]);
      } else if (result.warnings.length > 0) {
        onCleanWarnings?.(result.warnings);
      }
    } catch {
      // Serviço indisponível: mantém o conteúdo colado sem diagramação.
    } finally {
      setGazetteBusy(false);
    }
  };

  const editor = useEditor({
    extensions,
    content: content || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[360px] px-5 py-4",
      },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;

        const html = clipboard.getData("text/html");
        const text = clipboard.getData("text/plain");

        if (!html && !text) return false;

        event.preventDefault();

        // Editor praticamente vazio: a colagem representa o documento
        // completo e dispara a diagramação automática (módulo gazette).
        const editorWasEmpty = view.state.doc.textContent.trim().length < 20;

        const isOfficeHtml = /mso-|Mso|class="[^"]*Mso/i.test(html)
          || /<table[^>]*(?:xmlns|x:)/i.test(html);
        const cleanHtml = html ? normalizePastedTables(isOfficeHtml ? stripWordMso(html) : html) : "";
        const contentToInsert = cleanHtml && htmlLooksStructured(cleanHtml)
          ? cleanHtml
          : text
            ? plainTextToStructuredHtml(text)
            : autoformatHtml(cleanHtml);

        const element = document.createElement("div");
        element.innerHTML = contentToInsert;
        const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(element);
        view.focus();
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());

        if (isOfficeHtml || hasTabularText(text)) {
          const warnings: string[] = [];
          if (/mso-|Mso/i.test(html)) warnings.push("Formatação Word limpa");
          if (/<table[^>]*(?:xmlns|x:)/i.test(html)) warnings.push("Tabela Excel preservada");
          if (hasTabularText(text)) warnings.push("Tabela reconstruída");
          onCleanWarnings?.(warnings);
        }

        if (editorWasEmpty && (text.trim() || cleanHtml)) {
          gazetteRequested.current = true;
          void runGazetteParse({ contentText: text, contentHtml: cleanHtml });
        }

        return true;
      },
    },
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync external content changes into editor (e.g. loading a different matter)
  // Skip sync when the update originated from inside the editor itself.
  useEffect(() => {
    if (!editor || !content) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const current = editor.getHTML();
    if (content !== current) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  if (!editor) return null;

  const handleAutoFormat = () => {
    const structured = plainTextToStructuredHtml(editor.getText({ blockSeparator: "\n" }));
    editor.commands.setContent(structured, false);
    onChange(structured);
  };

  const handleAiFormat = async () => {
    setAiBusy(true);
    try {
      const result = await api.formatContentWithAI({
        content: editor.getHTML(),
        act_type: aiContext?.actType,
        title: aiContext?.title,
        summary: aiContext?.summary,
      });
      editor.commands.setContent(result.structured_html, false);
      onChange(result.structured_html);
      if (result.notes.length > 0) {
        onCleanWarnings?.(result.notes);
      }
    } finally {
      setAiBusy(false);
    }
  };

  const handleGazetteFormat = () => {
    void runGazetteParse({
      contentText: editor.getText({ blockSeparator: "\n" }),
      contentHtml: editor.getHTML(),
    });
  };

  return (
    <div className="min-h-[400px]">
      <Toolbar
        editor={editor}
        onPreview={() => setShowPreview(true)}
        onAutoFormat={handleAutoFormat}
        onAiFormat={handleAiFormat}
        onGazetteFormat={handleGazetteFormat}
        aiBusy={aiBusy}
        gazetteBusy={gazetteBusy}
      />
      <EditorContent editor={editor} />
      <HtmlPreview
        open={showPreview}
        onClose={() => setShowPreview(false)}
        html={editor.getHTML()}
      />
    </div>
  );
}
