export function htmlParaTexto(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article, blockquote').forEach((el) => {
      el.appendChild(doc.createTextNode('\n'));
    });
    const texto = doc.body.textContent || '';
    return texto
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '';
  }
}
