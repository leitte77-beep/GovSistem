import React from 'react';

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>]+)/g;
const INLINE_REGEX = /((?<!\w)\*[^*\n]+\*(?!\w)|(?<!\w)_[^_\n]+_(?!\w)|~[^~\n]+~|`[^`\n]+`)/g;

const codeStyle = {
  background: 'rgba(0,0,0,0.08)',
  borderRadius: 4,
  padding: '1px 5px',
  fontFamily: 'monospace',
  fontSize: '0.92em',
};

const linkStyle = { color: '#2563EB', textDecoration: 'underline' };

function renderInline(texto) {
  const tokens = texto.split(INLINE_REGEX).filter(Boolean);
  if (tokens.length <= 1) return texto;
  return tokens.map((token, j) => {
    switch (token[0]) {
      case '*':
        return React.createElement('strong', { key: j }, token.slice(1, -1));
      case '_':
        return React.createElement('em', { key: j }, token.slice(1, -1));
      case '~':
        return React.createElement('del', { key: j }, token.slice(1, -1));
      case '`':
        return React.createElement('code', { key: j, style: codeStyle }, token.slice(1, -1));
      default:
        return token;
    }
  });
}

export function renderizarMarkdown(texto) {
  if (texto == null) return texto;
  const str = String(texto);
  const partes = str.split(URL_REGEX);
  if (partes.length <= 1) return renderInline(str);
  return partes.map((parte, i) => {
    if (!parte) return null;
    if (i % 2 === 1) {
      return React.createElement('a', {
        key: `url-${i}`,
        href: /^www\./i.test(parte) ? `https://${parte}` : parte,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: linkStyle,
      }, parte);
    }
    const nodes = renderInline(parte);
    return React.createElement(React.Fragment, { key: `txt-${i}` }, nodes);
  });
}
