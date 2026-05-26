import { Extension, Mark } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { type Extensions } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textFormat: {
      setTextAlign: (alignment: "left" | "center" | "right" | "justify") => ReturnType;
      unsetTextAlign: () => ReturnType;
      setFontFamily: (fontFamily: string) => ReturnType;
      setFontSize: (fontSize: string) => ReturnType;
      setTextColor: (color: string) => ReturnType;
      setHighlightColor: (color: string) => ReturnType;
      unsetTextFormat: () => ReturnType;
    };
  }
}

const TextFormat = Extension.create({
  name: "textFormat",

  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph"],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attributes) => {
              if (!attributes.textAlign) return {};
              return { style: `text-align: ${attributes.textAlign}` };
            },
          },
        },
      },
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => element.style.fontFamily?.replace(/['"]/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.fontFamily) return {};
              return { style: `font-family: ${attributes.fontFamily}` };
            },
          },
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
          color: {
            default: null,
            parseHTML: (element) => element.style.color || null,
            renderHTML: (attributes) => {
              if (!attributes.color) return {};
              return { style: `color: ${attributes.color}` };
            },
          },
          backgroundColor: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes) => {
              if (!attributes.backgroundColor) return {};
              return { style: `background-color: ${attributes.backgroundColor}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign:
        (alignment) =>
        ({ commands }) =>
          commands.updateAttributes("paragraph", { textAlign: alignment })
          || commands.updateAttributes("heading", { textAlign: alignment }),
      unsetTextAlign:
        () =>
        ({ commands }) =>
          commands.updateAttributes("paragraph", { textAlign: null })
          || commands.updateAttributes("heading", { textAlign: null }),
      setFontFamily:
        (fontFamily) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily }).run(),
      setFontSize:
        (fontSize) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      setTextColor:
        (color) =>
        ({ chain }) =>
          chain().setMark("textStyle", { color }).run(),
      setHighlightColor:
        (color) =>
        ({ chain }) =>
          chain().setMark("textStyle", { backgroundColor: color }).run(),
      unsetTextFormat:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", {
              fontFamily: null,
              fontSize: null,
              color: null,
              backgroundColor: null,
            })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});

const LinkMark = Mark.create({
  name: "link",

  inclusive: false,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute("href"),
      },
      target: {
        default: "_blank",
      },
      rel: {
        default: "noopener noreferrer",
      },
    };
  },

  parseHTML() {
    return [{ tag: "a[href]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["a", HTMLAttributes, 0];
  },
});

export const extensions: Extensions = [
  StarterKit.configure({
    history: { depth: 100 },
    heading: { levels: [1, 2, 3, 4] },
  }),
  Image,
  Underline,
  TextStyle,
  TextFormat,
  LinkMark,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
];
