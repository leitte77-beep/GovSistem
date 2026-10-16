/**
 * Formatação que o Word (e o LibreOffice) guardam FORA do elemento colado.
 *
 * Na área de transferência o Word manda o negrito, a caixa alta e o recuo de
 * um parágrafo como estilo nomeado (`p.Ementa { font-weight:bold;
 * text-transform:uppercase; margin-left:212pt }`) num `<style>` do `<head>`; o
 * elemento só leva `class="Ementa"`. A limpeza da colagem descarta o `<head>` e
 * as classes, e com eles a súmula perdia negrito, caixa alta e recuo, o título
 * perdia a caixa alta, "Art. 1º" perdia o negrito.
 *
 * `applyPastedDocumentStyles` resolve isso antes da limpeza:
 *  1. copia para o `style` de cada elemento as propriedades tipográficas das
 *     regras que casam com ele (o `style` próprio do elemento continua
 *     vencendo, como no Word);
 *  2. troca negrito/itálico de parágrafo por `<strong>`/`<em>`, que sobrevivem
 *     a todas as etapas seguintes (editor, sanitizador, parser, PDF);
 *  3. converte caixa alta de FORMATO (`text-transform:uppercase`, versalete)
 *     em letras maiúsculas de verdade — o leitor do Diário vê maiúsculas, e a
 *     formatação deixa de depender de um estilo que qualquer etapa pode perder.
 */

/** Propriedades tipográficas que valem a pena trazer das regras de estilo. */
const INHERITED_PROPERTIES = [
  "font-weight", "font-style", "text-transform", "font-variant", "text-decoration",
] as const;

const BLOCK_PROPERTIES = new Set<string>([
  "text-align", "text-indent", "margin-left", "margin-right",
]);

const COPIED_PROPERTIES = new Set<string>([...INHERITED_PROPERTIES, ...BLOCK_PROPERTIES]);

const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "div"]);

interface StyleRule {
  tag: string | null;
  className: string | null;
  specificity: number;
  order: number;
  declarations: Map<string, string>;
}

function parseDeclarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of body.split(";")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const name = part.slice(0, index).trim().toLowerCase();
    const value = part.slice(index + 1).trim();
    if (name && value && COPIED_PROPERTIES.has(name)) out.set(name, value);
  }
  return out;
}

/**
 * Lê só seletores simples (`p`, `p.Classe`, `.Classe`), que é o que o Word e o
 * LibreOffice produzem. Seletores compostos são ignorados — melhor não aplicar
 * uma regra do que aplicá-la ao elemento errado.
 */
export function parseStyleRules(css: string): StyleRule[] {
  const rules: StyleRule[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--|-->/g, "");
  const blockRe = /([^{}@]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let order = 0;
  while ((match = blockRe.exec(text))) {
    const declarations = parseDeclarations(match[2]);
    if (!declarations.size) continue;
    for (const raw of match[1].split(",")) {
      const selector = raw.trim();
      const simple = /^([a-z][a-z0-9]*)?(?:\.([\w-]+))?$/i.exec(selector);
      if (!simple || (!simple[1] && !simple[2])) continue;
      const tag = simple[1]?.toLowerCase() ?? null;
      const className = simple[2] ?? null;
      rules.push({
        tag,
        className,
        specificity: (className ? 10 : 0) + (tag ? 1 : 0),
        order: order++,
        declarations,
      });
    }
  }
  return rules;
}

function styleMap(el: Element): Map<string, string> {
  return parseDeclarationsAll(el.getAttribute("style") || "");
}

function parseDeclarationsAll(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of body.split(";")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const name = part.slice(0, index).trim().toLowerCase();
    const value = part.slice(index + 1).trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

function writeStyle(el: Element, styles: Map<string, string>): void {
  const text = Array.from(styles, ([name, value]) => `${name}:${value}`).join(";");
  if (text) el.setAttribute("style", text);
  else el.removeAttribute("style");
}

function applyRules(body: Element, rules: StyleRule[]): void {
  if (!rules.length) return;
  for (const el of Array.from(body.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    const classes = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    const matching = rules
      .filter((rule) =>
        (!rule.tag || rule.tag === tag)
        && (!rule.className || classes.includes(rule.className)))
      .sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    if (!matching.length) continue;

    const own = styleMap(el);
    const merged = new Map<string, string>();
    for (const rule of matching) {
      for (const [name, value] of rule.declarations) {
        if (BLOCK_PROPERTIES.has(name) && !BLOCK_TAGS.has(tag)) continue;
        merged.set(name, value);
      }
    }
    for (const [name, value] of own) merged.set(name, value);
    writeStyle(el, merged);
  }
}

/** `align="center"` é como o Word marca alinhamento além do `style`. */
function alignAttributeToStyle(body: Element): void {
  for (const el of Array.from(body.querySelectorAll("[align]"))) {
    const align = (el.getAttribute("align") || "").toLowerCase();
    const styles = styleMap(el);
    if (["left", "center", "right", "justify"].includes(align) && !styles.has("text-align")) {
      styles.set("text-align", align);
      writeStyle(el, styles);
    }
    el.removeAttribute("align");
  }
}

function isBold(value: string | undefined): boolean | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "bold" || v === "bolder" || /^[6-9]00$/.test(v)) return true;
  if (v === "normal" || v === "lighter" || /^[1-5]00$/.test(v)) return false;
  return null;
}

function isItalic(value: string | undefined): boolean | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "italic" || v === "oblique") return true;
  if (v === "normal") return false;
  return null;
}

/**
 * Negrito/itálico declarados em parágrafo inteiro viram `<strong>`/`<em>` em
 * volta do conteúdo. O editor guardava o negrito de parágrafo só como atributo
 * de estilo, que o parser semântico e o motor de diagramação não enxergam.
 */
function blockEmphasisToMarks(body: Element, doc: Document): void {
  for (const el of Array.from(body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li"))) {
    const styles = styleMap(el);
    const bold = isBold(styles.get("font-weight"));
    const italic = isItalic(styles.get("font-style"));
    // Título já é negrito por natureza; o estilo no h1 não precisa de marca.
    const isHeading = /^h[1-6]$/i.test(el.tagName);
    if (bold && !isHeading && el.textContent?.trim()) wrapChildren(el, doc.createElement("strong"));
    if (italic && el.textContent?.trim()) wrapChildren(el, doc.createElement("em"));
    if (bold !== null) styles.delete("font-weight");
    if (italic !== null) styles.delete("font-style");
    writeStyle(el, styles);
  }
}

function wrapChildren(el: Element, wrapper: Element): void {
  while (el.firstChild) wrapper.appendChild(el.firstChild);
  el.appendChild(wrapper);
}

/**
 * Trechos com negrito declarado em `<span style="font-weight:bold">` (ou por
 * classe já aplicada) viram `<strong>`, pelo mesmo motivo.
 */
function inlineEmphasisToMarks(body: Element, doc: Document): void {
  for (const el of Array.from(body.querySelectorAll("span, font, a"))) {
    const styles = styleMap(el);
    const bold = isBold(styles.get("font-weight"));
    const italic = isItalic(styles.get("font-style"));
    if (bold) wrapChildren(el, doc.createElement("strong"));
    if (italic) wrapChildren(el, doc.createElement("em"));
    if (bold !== null) styles.delete("font-weight");
    if (italic !== null) styles.delete("font-style");
    writeStyle(el, styles);
  }
}

type CaseMode = "upper" | "none";

function caseOf(styles: Map<string, string>, inherited: CaseMode): CaseMode {
  const transform = styles.get("text-transform")?.toLowerCase();
  const variant = styles.get("font-variant")?.toLowerCase();
  if (transform === "uppercase") return "upper";
  if (variant && /small-caps/.test(variant)) return "upper";
  if (transform === "none" || transform === "lowercase" || transform === "capitalize") return "none";
  return inherited;
}

function materializeCase(node: Element, inherited: CaseMode): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (inherited === "upper" && child.nodeValue) {
        child.nodeValue = child.nodeValue.toLocaleUpperCase("pt-BR");
      }
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const styles = styleMap(el);
    const mode = caseOf(styles, inherited);
    const transform = styles.get("text-transform")?.toLowerCase();
    if (transform === "uppercase" || transform === "none") styles.delete("text-transform");
    if (styles.get("font-variant")) styles.delete("font-variant");
    writeStyle(el, styles);
    materializeCase(el, mode);
  }
}

export function applyPastedDocumentStyles(html: string): string {
  if (typeof window === "undefined" || !html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return html;

  const css = Array.from(doc.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .join("\n");
  applyRules(body, parseStyleRules(css));
  alignAttributeToStyle(body);
  blockEmphasisToMarks(body, doc);
  inlineEmphasisToMarks(body, doc);
  materializeCase(body, "none");

  // Devolve um documento completo: quem vem depois (limpeza do Word) volta a
  // fazer o parse e não deve achar estilos já aplicados duas vezes.
  for (const style of Array.from(doc.querySelectorAll("style"))) style.remove();
  return `<html><body>${body.innerHTML}</body></html>`;
}
