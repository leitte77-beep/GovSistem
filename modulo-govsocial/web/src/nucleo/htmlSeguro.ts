/**
 * Sanitização leve de HTML da evolução técnica (produzido pelo
 * <EditorEvolucao> via contentEditable) para exibição segura.
 *
 * Sem dependência externa: allowlist de tags de formatação, remoção de
 * atributos e de tags perigosas (script/style/iframe...). Qualquer tag fora
 * da lista é "desembrulhada" (o texto interno permanece).
 */

const TAGS_PERMITIDAS = new Set([
  "P",
  "DIV",
  "BR",
  "H3",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "SPAN",
]);

/** Tags cujo CONTEÚDO também deve ser descartado. */
const TAGS_REMOVIDAS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "FORM",
  "INPUT",
  "BUTTON",
]);

function limpar(no: Element): void {
  for (const el of Array.from(no.children)) {
    if (TAGS_REMOVIDAS.has(el.tagName)) {
      el.remove();
      continue;
    }
    limpar(el);
    if (!TAGS_PERMITIDAS.has(el.tagName)) {
      // Desembrulha: mantém o conteúdo, descarta a tag desconhecida.
      el.replaceWith(...Array.from(el.childNodes));
    } else {
      // Nenhum atributo é permitido (remove on*, style, class, href...).
      for (const attr of Array.from(el.attributes)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

/** Sanitiza o HTML para exibição (allowlist). */
export function sanitizarHtmlEvolucao(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  limpar(doc.body);
  return doc.body.innerHTML;
}

/**
 * Heurística: o texto veio do editor rich-text (HTML) ou é texto puro?
 * Detecta tags ou entidades HTML comuns (&nbsp;, &amp;...).
 */
export function pareceHtml(texto: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(texto) || /&(nbsp|amp|lt|gt|quot|#\d+);/i.test(texto);
}

/** Converte HTML do editor em texto puro (para buscas, PDF, resumos). */
export function htmlParaTexto(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const texto = doc.body.textContent ?? "";
  return texto.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
