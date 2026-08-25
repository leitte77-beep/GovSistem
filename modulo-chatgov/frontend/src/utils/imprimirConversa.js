// Impressão do histórico de um atendimento.
//
// Gera uma folha limpa — só a conversa, sem o app em volta — dentro de um
// iframe oculto e chama print() nele. Iframe em vez de window.open porque
// bloqueador de pop-up derruba a segunda opção sem avisar nada ao atendente.
import { formatarHora, formatarDataSeparador, mesmaData, extensaoDoMime, formatarTamanho, nomeArquivoDaUrl } from './arquivo';
import { urlVisualizavel } from '../components/MediaPreview';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataHoraExtenso(ts) {
  const d = ts ? new Date(ts) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Um bloco de mídia por tipo. Imagem sai impressa de verdade; os demais viram
// uma linha identificando o arquivo, já que PDF/áudio/vídeo não têm como ser
// representados no papel.
function blocoMidia(msg) {
  const url = urlVisualizavel(msg.media_url || msg.mediaUrl);
  if (!url) return '';
  const mime = (msg.media_mime || msg.mediaMime || '').toLowerCase();
  const nome = msg.media_nome || msg.mediaNome || nomeArquivoDaUrl(url) || 'arquivo';
  const tamanho = formatarTamanho(msg.media_tamanho);
  const ext = extensaoDoMime(msg.media_mime || msg.mediaMime);
  const detalhe = [ext, tamanho].filter(Boolean).join(' · ');

  if (mime.startsWith('image/')) {
    return `<div class="mid"><img src="${esc(url)}" alt="${esc(nome)}"><div class="cap">🖼️ ${esc(nome)}${detalhe ? ` <span class="det">(${esc(detalhe)})</span>` : ''}</div></div>`;
  }
  let icone = '📎';
  let rotulo = nome;
  if (mime.startsWith('audio/')) { icone = '🎤'; rotulo = `Áudio — ${nome}`; }
  else if (mime.startsWith('video/')) { icone = '🎬'; rotulo = `Vídeo — ${nome}`; }
  else if (mime.includes('pdf') || /\.pdf(\?|$)/i.test(url)) { icone = '📄'; rotulo = nome; }
  return `<div class="arq">${icone} <b>${esc(rotulo)}</b>${detalhe ? ` <span class="det">${esc(detalhe)}</span>` : ''}</div>`;
}

function blocoMensagem(msg, nomeCidadao) {
  const entrada = msg.direcao !== 'saida';
  const autor = entrada
    ? (nomeCidadao || 'Cidadão')
    : (msg.operador_nome || 'Atendimento');
  const partes = [];
  const midia = blocoMidia(msg);
  if (midia) partes.push(midia);
  if (msg.conteudo) partes.push(`<div class="txt">${esc(msg.conteudo).replace(/\n/g, '<br>')}</div>`);
  if (!partes.length) partes.push('<div class="txt vazio">(sem conteúdo)</div>');
  return `<div class="msg ${entrada ? 'ent' : 'sai'}">`
    + `<div class="meta"><span class="autor">${esc(autor)}</span><span class="hora">${esc(formatarHora(msg.criado_em))}</span></div>`
    + partes.join('')
    + '</div>';
}

const ESTILO = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; margin: 0; padding: 24px; font-size: 12px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  .cab { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 14px; }
  .cab dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 10px; margin: 8px 0 0; }
  .cab dt { font-weight: 700; color: #374151; }
  .cab dd { margin: 0; color: #111827; }
  .sep { text-align: center; margin: 14px 0 8px; color: #6B7280; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .sep span { border-bottom: 1px solid #D1D5DB; padding: 0 10px 3px; }
  .msg { border-left: 3px solid #D1D5DB; padding: 4px 0 4px 10px; margin: 0 0 9px; page-break-inside: avoid; }
  .msg.sai { border-left-color: #2563EB; }
  .meta { font-size: 10px; color: #6B7280; margin-bottom: 2px; }
  .meta .autor { font-weight: 700; color: #374151; }
  .meta .hora { margin-left: 6px; }
  .txt { white-space: pre-wrap; word-break: break-word; line-height: 1.45; }
  .txt.vazio { color: #9CA3AF; font-style: italic; }
  .arq { border: 1px solid #D1D5DB; border-radius: 6px; padding: 5px 9px; margin: 3px 0; background: #F9FAFB; display: inline-block; }
  .det { color: #6B7280; font-size: 10px; }
  .mid { margin: 4px 0; }
  .mid img { max-width: 320px; max-height: 320px; border: 1px solid #D1D5DB; border-radius: 6px; display: block; }
  .mid .cap { font-size: 10px; color: #6B7280; margin-top: 2px; }
  .rodape { margin-top: 18px; border-top: 1px solid #D1D5DB; padding-top: 6px; font-size: 10px; color: #6B7280; }
  @page { margin: 14mm; }
`;

export function montarHtmlConversa({ conversa, mensagens, nomeCidadao, atendente }) {
  const lista = (mensagens || []).filter((m) => !m.excluida);
  const corpo = [];
  lista.forEach((msg, i) => {
    const anterior = lista[i - 1];
    if (!anterior || !mesmaData(anterior.criado_em, msg.criado_em)) {
      corpo.push(`<div class="sep"><span>${esc(formatarDataSeparador(msg.criado_em))}</span></div>`);
    }
    corpo.push(blocoMensagem(msg, nomeCidadao));
  });
  if (!corpo.length) corpo.push('<div class="txt vazio">Nenhuma mensagem nesta conversa.</div>');

  const protocolo = conversa?.protocolo_numero || conversa?.protocolo || '';
  const periodo = lista.length
    ? `${dataHoraExtenso(lista[0].criado_em)} a ${dataHoraExtenso(lista[lista.length - 1].criado_em)}`
    : '—';
  const linhas = [
    ['Cidadão', nomeCidadao || '—'],
    ['Telefone', conversa?.contato_telefone || '—'],
    protocolo ? ['Protocolo', `#${protocolo}`] : null,
    ['Atendente', atendente || '—'],
    conversa?.departamento_nome ? ['Setor', conversa.departamento_nome] : null,
    ['Período', periodo],
    ['Mensagens', String(lista.length)],
  ].filter(Boolean);

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">`
    + `<title>Atendimento ${esc(protocolo ? '#' + protocolo : nomeCidadao || '')}</title>`
    + `<style>${ESTILO}</style></head><body>`
    + `<div class="cab"><h1>Registro de atendimento</h1>`
    + `<dl>${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`
    + corpo.join('')
    + `<div class="rodape">Impresso em ${esc(dataHoraExtenso())}.</div>`
    + `</body></html>`;
}

// Espera as imagens carregarem antes de imprimir — sem isso o diálogo abre com
// os espaços em branco. Timeout para não travar se alguma mídia não responder.
function aguardarImagens(doc, timeoutMs = 8000) {
  const imgs = Array.from(doc.images || []);
  const pendentes = imgs.filter((img) => !img.complete);
  if (!pendentes.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pendentes.map((img) => new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }))),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function imprimirConversa(dados) {
  const html = montarHtmlConversa(dados);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const limpar = () => { setTimeout(() => iframe.remove(), 1000); };
  try {
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    await aguardarImagens(doc);
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  } finally {
    limpar();
  }
}
