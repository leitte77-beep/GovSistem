"use client";

import { forwardRef, useEffect, useImperativeHandle } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";

export interface RichTextEditorHandle {
  insertHtml: (html: string) => void;
  focus: () => void;
  clear: () => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor(
    { value, onChange, placeholder = "Digite o conteúdo do documento…", minHeight = 240, disabled = false },
    ref,
  ) {
    const editor = useEditor({
      editable: !disabled,
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
        Underline,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({ placeholder }),
      ],
      content: value || "",
      onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    });

    useEffect(() => {
      if (!editor) return;
      if (value !== editor.getHTML()) {
        editor.commands.setContent(value || "", { emitUpdate: false });
      }
    }, [value, editor]);

    useImperativeHandle(
      ref,
      () => ({
        insertHtml: (html: string) => editor?.chain().focus().insertContent(html).run(),
        focus: () => editor?.commands.focus(),
        clear: () => editor?.commands.clearContent(),
      }),
      [editor],
    );

    if (!editor) return null;

    const ToolbarButton = ({
      active,
      onClick,
      icon,
      label,
      disabled: btnDisabled = false,
    }: {
      active?: boolean;
      onClick: () => void;
      icon: string;
      label: string;
      disabled?: boolean;
    }) => (
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={btnDisabled}
        className={`w-8 h-8 flex items-center justify-center rounded-md text-on-surface-variant transition-colors disabled:opacity-40 ${
          active ? "bg-primary text-on-primary" : "hover:bg-surface-container-high"
        }`}
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          {icon}
        </span>
      </button>
    );

    const Divider = () => <span className="w-px h-5 bg-outline-variant mx-1" aria-hidden="true" />;

    return (
      <div className={`rounded-xl border border-outline-variant overflow-hidden bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary/40 transition-shadow ${disabled ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-outline-variant bg-surface-container-low">
          <ToolbarButton
            icon="format_bold"
            label="Negrito"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            icon="format_italic"
            label="Itálico"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            icon="format_underlined"
            label="Sublinhado"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            icon="strikethrough_s"
            label="Tachado"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <Divider />
          <ToolbarButton
            icon="format_h2"
            label="Título 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolbarButton
            icon="format_h3"
            label="Título 3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          />
          <Divider />
          <ToolbarButton
            icon="format_align_left"
            label="Alinhar à esquerda"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          />
          <ToolbarButton
            icon="format_align_center"
            label="Centralizar"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          />
          <ToolbarButton
            icon="format_align_right"
            label="Alinhar à direita"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          />
          <ToolbarButton
            icon="format_align_justify"
            label="Justificar"
            active={editor.isActive({ textAlign: "justify" })}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          />
          <Divider />
          <ToolbarButton
            icon="format_list_bulleted"
            label="Lista com marcadores"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            icon="format_list_numbered"
            label="Lista numerada"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            icon="format_quote"
            label="Citação"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <Divider />
          <ToolbarButton
            icon="table_view"
            label="Inserir tabela"
            active={editor.isActive("table")}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          />
          <ToolbarButton
            icon="undo"
            label="Desfazer"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          />
          <ToolbarButton
            icon="redo"
            label="Refazer"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          />
        </div>
        <div className="editor-content">
          <EditorContent editor={editor} style={{ minHeight }} />
        </div>
      </div>
    );
  },
);

export default RichTextEditor;
