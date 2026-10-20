"use client";

import { useState } from "react";
import { type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Eye,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo,
  RemoveFormatting,
  ScrollText,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";
import clsx from "clsx";

interface ToolbarProps {
  editor: Editor | null;
  onPreview: () => void;
  onAutoFormat: () => void;
  onOfficialFormat: () => void;
  onAiFormat: () => void;
  onToggleA4: () => void;
  viewMode: "edit" | "a4";
  aiBusy?: boolean;
}

const fontFamilies = [
  "Arial",
  "Arial Black",
  "Book Antiqua",
  "Comic Sans MS",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Impact",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

const fontSizes = ["10pt", "12pt", "14pt", "16pt", "18pt", "24pt", "32pt"];
type CaseMode = "upper" | "lower" | "title" | "sentence";

// Preposições/artigos que ficam minúsculos em "Iniciais Maiúsculas".
const LOWER_WORDS = new Set(["a", "as", "o", "os", "e", "de", "da", "das", "do", "dos", "em", "na", "nas", "no", "nos", "por", "para", "com"]);

function transformCase(text: string, mode: CaseMode, startsSentence: boolean): string {
  const lower = text.toLocaleLowerCase("pt-BR");
  if (mode === "upper") return text.toLocaleUpperCase("pt-BR");
  if (mode === "lower") return lower;
  if (mode === "title") {
    let first = startsSentence;
    return lower.replace(/\p{L}+/gu, (word) => {
      const keep = !first && LOWER_WORDS.has(word);
      first = false;
      return keep ? word : word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    });
  }
  let capitalize = startsSentence;
  return lower.replace(/[.!?]\s+|\p{L}/gu, (match) => {
    if (match.length > 1 || /[.!?]/.test(match)) {
      capitalize = true;
      return match;
    }
    if (!capitalize) return match;
    capitalize = false;
    return match.toLocaleUpperCase("pt-BR");
  });
}

/** Troca a caixa do texto selecionado mantendo negrito, itálico etc. */
function changeCase(editor: Editor, mode: CaseMode) {
  editor.chain().focus().command(({ tr, state }) => {
    const { from, to } = state.selection;
    if (from === to) return false;
    let firstChunk = true;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || !node.text) return;
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      const original = node.text.slice(start - pos, end - pos);
      const atBlockStart = state.doc.resolve(start).parentOffset === 0;
      const changed = transformCase(original, mode, firstChunk || atBlockStart);
      firstChunk = false;
      if (changed !== original) {
        tr.replaceWith(tr.mapping.map(start), tr.mapping.map(end), state.schema.text(changed, node.marks));
      }
    });
    return true;
  }).run();
}

const lineHeights = ["1", "1.15", "1.5", "2"];
const paragraphSpacings = [
  { value: "0", label: "Sem espaço" },
  { value: "6pt", label: "6 pt" },
  { value: "12pt", label: "12 pt" },
  { value: "18pt", label: "18 pt" },
];

export default function Toolbar({ editor, onPreview, onAutoFormat, onOfficialFormat, onAiFormat, onToggleA4, viewMode, aiBusy }: ToolbarProps) {
  const [clearConfirm, setClearConfirm] = useState(false);
  if (!editor) return null;

  const Button = ({
    onClick,
    active,
    title,
    disabled,
    children,
    ariaLabel,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    disabled?: boolean;
    children: React.ReactNode;
    ariaLabel?: string;
  }) => (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      title={title}
      aria-label={ariaLabel || title}
      disabled={disabled}
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-slate-600 transition-colors",
        "hover:border-slate-300 hover:bg-white hover:text-slate-950",
        active && "border-sky-300 bg-sky-100 text-sky-800",
        disabled && "cursor-not-allowed opacity-35 hover:border-transparent hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );

  const Separator = () => <div className="mx-1 h-7 w-px bg-slate-300" />;

  const Select = ({
    title,
    value,
    onChange,
    children,
    className,
  }: {
    title: string;
    value: string;
    onChange: (value: string) => void;
    children: React.ReactNode;
    className?: string;
  }) => (
    <select
      title={title}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={clsx(
        "h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 outline-none transition",
        "hover:border-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
        className
      )}
    >
      {children}
    </select>
  );

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Informe o link", previous || "https://");
    if (url === null) return;

    if (!url.trim()) {
      editor.chain().focus().unsetMark("link").run();
      return;
    }

    editor.chain().focus().setMark("link", { href: url.trim() }).run();
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const currentFont = editor.getAttributes("textStyle").fontFamily || "";
  const currentSize = editor.getAttributes("textStyle").fontSize || "";
  const blockAttributes = editor.isActive("heading") ? editor.getAttributes("heading") : editor.getAttributes("paragraph");
  const currentLineHeight = blockAttributes.lineHeight || "";
  const currentParagraphSpacing = blockAttributes.marginBottom || "";

  return (
    // Fixa no topo ao rolar o texto: não precisa voltar ao início para formatar.
    <div className="sticky top-0 z-20 rounded-t-xl border border-b-0 border-slate-300 bg-slate-100/95 px-2 py-2 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-1">
        {clearConfirm ? (
          <>
            <button
              type="button"
              onClick={() => { editor.chain().focus().clearContent().run(); setClearConfirm(false); }}
              title="Confirmar limpeza"
              aria-label="Confirmar limpeza de conteúdo"
              className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-red-600 border border-red-300 bg-red-50 hover:bg-red-100 transition-colors"
            >
              Limpar tudo?
            </button>
            <button
              type="button"
              onClick={() => setClearConfirm(false)}
              title="Cancelar"
              aria-label="Cancelar limpeza de conteúdo"
              className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-200 transition-colors"
            >
              Não
            </button>
          </>
        ) : (
          <Button onClick={() => setClearConfirm(true)} title="Limpar conteúdo" aria-label="Limpar todo o conteúdo do editor">
            <Trash2 size={17} />
          </Button>
        )}
        <Separator />

        <Button onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito">
          <Bold size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico">
          <Italic size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado">
          <UnderlineIcon size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Tachado">
          <Strikethrough size={17} />
        </Button>

        <Separator />

        <Button onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Alinhar à esquerda">
          <AlignLeft size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Centralizar">
          <AlignCenter size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Alinhar à direita">
          <AlignRight size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })} title="Justificar">
          <AlignJustify size={17} />
        </Button>

        <Separator />

        <Select
          title="Fonte"
          value={currentFont}
          onChange={(value) => value && editor.chain().focus().setFontFamily(value).run()}
          className="w-40"
        >
          <option value="">Fonte</option>
          {fontFamilies.map((font) => (
            <option key={font} value={font} style={{ fontFamily: font }}>
              {font}
            </option>
          ))}
        </Select>

        <Select
          title="Tamanho"
          value={currentSize}
          onChange={(value) => value && editor.chain().focus().setFontSize(value).run()}
          className="w-24"
        >
          <option value="">Tamanho</option>
          {fontSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>

        <Select
          title="Espaçamento entre linhas"
          value={currentLineHeight}
          onChange={(value) => editor.chain().focus().setBlockStyle({ lineHeight: value || null }).run()}
          className="w-28"
        >
          <option value="">Entrelinhas</option>
          {lineHeights.map((height) => (
            <option key={height} value={height}>
              {height.replace(".", ",")}
            </option>
          ))}
        </Select>

        <Select
          title="Espaçamento entre parágrafos"
          value={currentParagraphSpacing}
          onChange={(value) => editor.chain().focus().setBlockStyle(
            value ? { marginTop: "0", marginBottom: value } : { marginTop: null, marginBottom: null },
          ).run()}
          className="w-28"
        >
          <option value="">Parágrafo</option>
          {paragraphSpacings.map((spacing) => (
            <option key={spacing.value} value={spacing.value}>
              {spacing.label}
            </option>
          ))}
        </Select>

        <Select
          title="Maiúsculas e minúsculas (texto selecionado)"
          value=""
          onChange={(value) => value && changeCase(editor, value as CaseMode)}
          className="w-24"
        >
          <option value="">Aa</option>
          <option value="upper">MAIÚSCULAS</option>
          <option value="lower">minúsculas</option>
          <option value="title">Iniciais Maiúsculas</option>
          <option value="sentence">Como em uma frase</option>
        </Select>

        <label className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700" title="Cor do texto">
          A
          <input
            type="color"
            className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
            onChange={(event) => editor.chain().focus().setTextColor(event.target.value).run()}
          />
        </label>
        <label className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700" title="Cor de destaque">
          <Highlighter size={16} />
          <input
            type="color"
            className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
            defaultValue="#fff3bf"
            onChange={(event) => editor.chain().focus().setHighlightColor(event.target.value).run()}
          />
        </label>

        <Separator />

        <Button onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")} title="Parágrafo">
          <Pilcrow size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Título 1">
          <Heading1 size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Título 2">
          <Heading2 size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Título 3">
          <Heading3 size={17} />
        </Button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Button onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista com marcadores">
          <List size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada">
          <ListOrdered size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Citação">
          <Quote size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Bloco de código">
          <Code size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha horizontal">
          <Minus size={17} />
        </Button>

        <Separator />

        <Button onClick={setLink} active={editor.isActive("link")} title="Inserir link">
          <Link size={17} />
        </Button>
        <Button onClick={addTable} title="Inserir tabela">
          <TableIcon size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.isActive("table")} title="Adicionar coluna">
          +C
        </Button>
        <Button onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.isActive("table")} title="Adicionar linha">
          +L
        </Button>
        <Button onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.isActive("table")} title="Remover tabela">
          <Trash2 size={17} />
        </Button>

        <Separator />

        <Button onClick={() => editor.chain().focus().unsetTextFormat().clearNodes().unsetAllMarks().run()} title="Remover formatação">
          <RemoveFormatting size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Desfazer">
          <Undo size={17} />
        </Button>
        <Button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Refazer">
          <Redo size={17} />
        </Button>

        <div className="flex-1" />

        <Button onClick={onToggleA4} active={viewMode === "a4"} title={viewMode === "a4" ? "Voltar para edição" : "Pré-visualização A4"}>
          {viewMode === "a4" ? <FileText size={17} /> : <ScrollText size={17} />}
        </Button>
        <Button onClick={onPreview} title="Preview HTML">
          <Eye size={17} />
        </Button>
        <Button onClick={onAutoFormat} title="Autoformatar conteúdo">
          <span className="material-symbols-outlined text-[17px]">auto_fix_high</span>
        </Button>
        <Button onClick={onOfficialFormat} title="Formatar como ato oficial">
          <span className="material-symbols-outlined text-[17px]">gavel</span>
        </Button>
        <Button onClick={onAiFormat} title="Montar matéria com IA a partir do texto do editor" disabled={aiBusy}>
          <span className="material-symbols-outlined text-[17px]">{aiBusy ? "progress_activity" : "smart_toy"}</span>
        </Button>
      </div>
    </div>
  );
}
