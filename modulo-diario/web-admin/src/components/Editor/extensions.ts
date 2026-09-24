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
          ...Object.fromEntries(
            ["textIndent", "marginTop", "marginBottom", "marginLeft", "marginRight", "lineHeight", "textTransform", "fontWeight", "fontStyle"].map((property) => [property, {
              default: null,
              parseHTML: (element: HTMLElement) => element.style.getPropertyValue(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)) || null,
              renderHTML: (attributes: Record<string, string>) => attributes[property]
                ? { style: `${property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${attributes[property]}` }
                : {},
            }]),
          ),
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

/**
 * Preserva a aparência dos quadros vindos do Word (avisos de licitação, termos
 * de homologação): bordas por lado, faixas coloridas, largura e alinhamento
 * vertical. Sem isto o editor devolve `style=""` vazio e o ato é publicado sem
 * a forma que a prefeitura assina — nesses documentos o quadro É o ato.
 *
 * Cada propriedade vira um atributo próprio (e não um `style` inteiro) porque
 * o TipTap junta os `style` devolvidos por vários atributos, e assim a largura
 * calculada pelo redimensionamento de coluna continua funcionando.
 */
const CELL_STYLE_PROPERTIES = [
  "border", "borderTop", "borderRight", "borderBottom", "borderLeft",
  "backgroundColor", "verticalAlign", "textAlign", "padding", "width",
];

const TABLE_STYLE_PROPERTIES = ["borderCollapse", "tableLayout", "width"];

const cssName = (property: string) =>
  property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const styleAttributes = (properties: string[]) =>
  Object.fromEntries(properties.map((property) => [property, {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.style.getPropertyValue(cssName(property)) || null,
    renderHTML: (attributes: Record<string, string>) => attributes[property]
      ? { style: `${cssName(property)}: ${attributes[property]}` }
      : {},
  }]));

const TableFormat = Extension.create({
  name: "tableFormat",

  addGlobalAttributes() {
    return [
      { types: ["table"], attributes: styleAttributes(TABLE_STYLE_PROPERTIES) },
      {
        types: ["tableCell", "tableHeader"],
        attributes: styleAttributes(CELL_STYLE_PROPERTIES),
      },
      { types: ["tableRow"], attributes: styleAttributes(["backgroundColor", "height"]) },
    ];
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
  TableFormat,
  LinkMark,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
];
