"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { useEffect, useRef, useState } from "react";
import { extensions } from "./extensions";
import Toolbar from "./Toolbar";
import { stripWordMso } from "@/lib/sanitize";
import HtmlPreview from "../Matter/HtmlPreview";

interface EditorProps {
  content: string;
  onChange: (html: string) => void;
  onCleanWarnings?: (warnings: string[]) => void;
}

function textToHtml(text: string): string {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);

  return blocks
    .map((block) => {
      const lines = block.split("\n").filter((line) => line.trim().length > 0);

      if (isTabularTextBlock(lines)) {
        return tabularTextToHtmlTable(lines);
      }

      return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isTabularTextBlock(lines: string[]): boolean {
  if (lines.length < 2) return false;
  return lines.every((line) => line.split("\t").filter(Boolean).length >= 2);
}

function hasTabularText(text: string): boolean {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .some((block) => isTabularTextBlock(block.split("\n").filter((line) => line.trim().length > 0)));
}

function tabularTextToHtmlTable(lines: string): string;
function tabularTextToHtmlTable(lines: string[]): string;
function tabularTextToHtmlTable(lines: string | string[]): string {
  const rows = Array.isArray(lines)
    ? lines
    : lines.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim().length > 0);

  const cells = rows.map((line) => line.split("\t").map((cell) => cell.trim()));
  const columnCount = Math.max(...cells.map((row) => row.length));

  const tableRows = cells
    .map((row) => {
      const tableCells = Array.from({ length: columnCount }, (_, index) => {
        const value = escapeHtml(row[index] ?? "").replace(/\n/g, "<br>");
        return `<td><p>${value || "<br>"}</p></td>`;
      }).join("");

      return `<tr>${tableCells}</tr>`;
    })
    .join("");

  return `<table><tbody>${tableRows}</tbody></table>`;
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

export default function Editor({ content, onChange, onCleanWarnings }: EditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const isInternalUpdate = useRef(false);

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

        const isOfficeHtml = /mso-|Mso|class="[^"]*Mso/i.test(html)
          || /<table[^>]*(?:xmlns|x:)/i.test(html);
        const cleanHtml = html
          ? normalizePastedTables(isOfficeHtml ? stripWordMso(html) : html)
          : "";
        const shouldUseTextTableFallback = Boolean(
          text
            && hasTabularText(text)
        );
        const contentToInsert = shouldUseTextTableFallback
          ? textToHtml(text)
          : cleanHtml || textToHtml(text);

        const element = document.createElement("div");
        element.innerHTML = contentToInsert;
        const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(element);
        view.focus();
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());

        if (isOfficeHtml) {
          const warnings: string[] = [];
          if (/mso-|Mso/i.test(html)) warnings.push("Formatação Word limpa");
          if (/<table[^>]*(?:xmlns|x:)/i.test(html)) warnings.push("Tabela Excel preservada");
          if (shouldUseTextTableFallback) warnings.push("Tabela do Word reconstruída");
          onCleanWarnings?.(warnings);
        }

        return true;
      },
    },
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
    },
  });

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

  return (
    <div className="min-h-[400px]">
      <Toolbar editor={editor} onPreview={() => setShowPreview(true)} />
      <EditorContent editor={editor} />
      <HtmlPreview
        open={showPreview}
        onClose={() => setShowPreview(false)}
        html={editor.getHTML()}
      />
    </div>
  );
}
