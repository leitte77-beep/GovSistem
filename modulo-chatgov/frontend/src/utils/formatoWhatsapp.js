import React from 'react';

// Renderiza a marcação do WhatsApp (*negrito*, _itálico_, ~riscado~, ```mono```
// e `código`) como elementos React — nunca como HTML, então texto colado não
// injeta nada na página. Usado na prévia do editor ampliado, para o atendente
// ver a mensagem como o cidadão vai receber.

const RE_MARCACAO = /```([\s\S]+?)```|`([^`\n]+?)`|\*(\S(?:[^*\n]*?\S)?)\*|_(\S(?:[^_\n]*?\S)?)_|~(\S(?:[^~\n]*?\S)?)~/g;

// Como no WhatsApp, o marcador só vale colado a espaço/pontuação: "2*3*4" e
// "nome_do_arquivo_x" continuam texto puro.
const ehLetraOuDigito = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);

const ESTILO_MONO = { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: '0.92em' };

export function formatarWhatsapp(texto, prefixo = 'f') {
  if (!texto) return [];
  const saida = [];
  let pendente = '';
  let i = 0;
  let n = 0;
  const re = new RegExp(RE_MARCACAO.source, 'g');
  let m;
  while ((m = re.exec(texto)) !== null) {
    const antes = texto[m.index - 1];
    const depois = texto[m.index + m[0].length];
    if (ehLetraOuDigito(antes) || ehLetraOuDigito(depois)) {
      re.lastIndex = m.index + 1;
      continue;
    }
    pendente += texto.slice(i, m.index);
    if (pendente) { saida.push(pendente); pendente = ''; }
    const key = `${prefixo}-${n++}`;
    if (m[1] !== undefined) saida.push(React.createElement('span', { key, style: { ...ESTILO_MONO, whiteSpace: 'pre-wrap' } }, m[1]));
    else if (m[2] !== undefined) saida.push(React.createElement('code', { key, style: { ...ESTILO_MONO, padding: '0 3px', borderRadius: 3, background: 'rgba(127,127,127,0.18)' } }, m[2]));
    else if (m[3] !== undefined) saida.push(React.createElement('strong', { key }, formatarWhatsapp(m[3], key)));
    else if (m[4] !== undefined) saida.push(React.createElement('em', { key }, formatarWhatsapp(m[4], key)));
    else if (m[5] !== undefined) saida.push(React.createElement('s', { key }, formatarWhatsapp(m[5], key)));
    i = m.index + m[0].length;
  }
  pendente += texto.slice(i);
  if (pendente) saida.push(pendente);
  return saida;
}
