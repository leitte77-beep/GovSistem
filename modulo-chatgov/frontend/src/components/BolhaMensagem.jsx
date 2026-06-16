import React, { useState } from 'react';
import { T } from '../theme';
import { formatarHora } from '../utils/arquivo';
import { MediaPreview, MediaLightbox } from './MediaPreview';
import { votarEnquete } from '../api';

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;
const MARKDOWN_REGEX = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;

/**
 * Renderiza markdown inline: **bold**, *italic*, `code`, URLs clicaveis
 */
function renderizarMarkdown(texto) {
  if (!texto) return texto;

  // Primeiro, divide por URLs para protegê-las de processamento interno
  const partes = texto.split(URL_REGEX);
  return partes.map((parte, i) => {
    // URLs são renderizadas como links
    if (URL_REGEX.test(parte) && i % 2 === 1) {
      return React.createElement('a', {
        key: i,
        href: parte,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: { color: '#2563EB', textDecoration: 'underline' },
      }, parte);
    }

    // Renderiza bold, italic e code inline
    const tokens = parte.split(MARKDOWN_REGEX).filter(Boolean);
    if (tokens.length <= 1) {
      // Garantir que um único texto também seja keyed para evitar warning
      return i === 0 && tokens.length === 1 ? tokens[0] : React.createElement(React.Fragment, { key: i }, tokens[0] || parte);
    }

    return React.createElement(React.Fragment, { key: i },
      tokens.map((token, j) => {
        // **bold**
        if (/^\*\*(.+)\*\*$/.test(token)) {
          return React.createElement('strong', { key: j }, token.slice(2, -2));
        }
        // *italic*
        if (/^\*(.+)\*$/.test(token)) {
          return React.createElement('em', { key: j }, token.slice(1, -1));
        }
        // `code`
        if (/^`(.+)`$/.test(token)) {
          return React.createElement('code', {
            key: j,
            style: {
              background: 'rgba(0,0,0,0.06)', borderRadius: 4, padding: '1px 5px',
              fontFamily: 'monospace', fontSize: 13,
            },
          }, token.slice(1, -1));
        }
        return token;
      }),
    );
  });
}

function EnqueteWidget({ msg, opId }) {
  const [dados, setDados] = useState(() => {
    try { return JSON.parse(msg.conteudo || '{}'); } catch { return {}; }
  });
  const { pergunta, opcoes, votos } = dados;
  if (!pergunta || !opcoes) return null;

  const totalVotos = Object.values(votos || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  const meuVoto = Object.entries(votos || {}).find(([_, arr]) => (arr || []).includes(opId))?.[0];

  const votar = async (idx) => {
    try {
      const canalId = msg.canal_id || msg.canalId;
      if (canalId) {
        const res = await votarEnquete(canalId, msg.id, idx);
        setDados(res.dados);
      }
    } catch {}
  };

  return React.createElement('div', { style: { marginTop: 8, padding: '10px 0' } },
    React.createElement('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 8, color: T.text } }, pergunta),
    ...opcoes.map((op, i) => {
      const count = (votos?.[String(i)] || []).length;
      const pct = totalVotos > 0 ? Math.round((count / totalVotos) * 100) : 0;
      const selecionada = String(i) === meuVoto;
      return React.createElement('div', {
        key: i,
        onClick: () => !meuVoto && votar(i),
        style: {
          position: 'relative', padding: '7px 10px', marginBottom: 5, borderRadius: 8,
          cursor: meuVoto ? 'default' : 'pointer',
          background: selecionada ? '#DBEAFE' : T.surfaceMuted,
          border: selecionada ? '1px solid #93C5FD' : `1px solid ${T.border}`,
          overflow: 'hidden',
        },
      },
        totalVotos > 0 && React.createElement('div', {
          style: {
            position: 'absolute', inset: 0, background: selecionada ? '#BFDBFE' : '#E5E7EB',
            width: `${pct}%`, borderRadius: 8, transition: 'width 0.3s', zIndex: 0,
          },
        }),
        React.createElement('div', { style: { position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 } },
          React.createElement('span', { style: { fontWeight: 500 } }, op),
          React.createElement('span', { style: { fontSize: 12, color: T.textMuted } },
            count > 0 ? `${count} (${pct}%)` : ''),
        ),
      );
    }),
    React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginTop: 4, textAlign: 'center' } },
      `${totalVotos} voto${totalVotos !== 1 ? 's' : ''}`),
  );
}

function Reacoes({ msg, operadores }) {
  if (!msg._reacoes) return null;
  const chaves = Object.keys(msg._reacoes);
  if (chaves.length === 0) return null;
  return React.createElement('div', { style: { display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' } },
    chaves.map((emoji) => {
      const data = msg._reacoes[emoji];
      const ids = Array.isArray(data) ? data : (data.operadores || []);
      const count = Array.isArray(data) ? data.length : (data.contagem || 1);
      const nomes = ids.map((id) => {
        if (typeof id === 'object' && id.nome) return id.nome;
        return (operadores[id] || 'Operador');
      }).filter(Boolean);
      return React.createElement('span', {
        key: emoji, title: nomes.length ? nomes.join(', ') : 'Reacao',
        'aria-label': `${count} reacao ${emoji}`,
        tabIndex: 0, role: 'button',
        style: { background: '#F0F2F5', borderRadius: 10, padding: '2px 7px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, border: '1px solid #E4E6EB' },
      },
        React.createElement('span', null, emoji),
        React.createElement('span', { style: { fontWeight: 600, fontSize: 11, color: '#65676B' } }, count),
      );
    }),
  );
}

export function BolhaMensagem({ msg, isMe, agrupada, opId, operadores, onContextMenu, mostrarAutor = true }) {
  const [lightbox, setLightbox] = useState(null);
  const hasMedia = !!(msg.media_url || msg.mediaUrl);
  const tipo = msg.tipo || 'texto';

  const abrirLightbox = (src, t, mime, nome) => setLightbox({ src, tipo: t, mime, nome });
  const fecharLightbox = () => setLightbox(null);

  return React.createElement(React.Fragment, null,
    React.createElement('div', {
      'data-msg-id': msg.id,
      style: {
        display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start',
        marginBottom: agrupada ? 1 : 6, paddingLeft: isMe ? 60 : 0, paddingRight: isMe ? 0 : 60,
      },
    },
      React.createElement('div', {
        onContextMenu: (e) => { e.preventDefault(); onContextMenu?.(e, msg); },
        onDoubleClick: (e) => onContextMenu?.(e, msg),
        'aria-label': `${msg.remetente_nome || 'Operador'} disse: ${msg.conteudo || tipo}`,
        style: {
          background: isMe ? '#DCF8C6' : '#FFFFFF',
          color: T.text, padding: '6px 9px 4px 9px',
          borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          maxWidth: '100%', boxShadow: '0 1px 2px rgba(16,26,42,0.08)', position: 'relative',
          cursor: 'context-menu',
        },
      },
        !isMe && mostrarAutor && msg.remetente_nome && React.createElement('div', {
          style: { fontSize: 12, fontWeight: 600, color: '#2563EB', marginBottom: 2 },
        }, msg.remetente_nome),
        msg.respondendo_a && React.createElement('div', {
          style: { fontSize: 11, color: T.textMuted, marginBottom: 3, paddingLeft: 6, borderLeft: `2px solid ${T.primary}` },
        }, 'Em resposta a uma mensagem'),
        msg.encaminhada_de && React.createElement('div', {
          style: { fontSize: 11, color: T.textMuted, marginBottom: 3, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 },
        }, '↳ Encaminhado'),
        msg.excluida
          ? React.createElement('span', { style: { fontStyle: 'italic', color: T.textMuted, fontSize: 13 } }, 'Mensagem excluida')
          : React.createElement(React.Fragment, null,
              hasMedia && React.createElement('div', { style: { marginBottom: msg.conteudo ? 4 : 0 } },
                React.createElement(MediaPreview, { msg, isMe, onOpenLightbox: abrirLightbox }),
              ),
              msg.conteudo && React.createElement('div', {
                style: { fontSize: 14, lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
              }, renderizarMarkdown(msg.conteudo)),

              // Enquete
              tipo === 'enquete' && React.createElement(EnqueteWidget, { msg, opId }),
            ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, marginTop: 2 } },
          msg.editada && React.createElement('span', { title: `Editada em ${formatarHora(msg.editada_em || msg.editadaEm)}`, style: { fontSize: 10, color: T.textMuted } }, '(editado)'),
          React.createElement('span', { style: { fontSize: 10, color: T.textMuted } }, formatarHora(msg.criado_em || msg.criadoEm)),
        ),
        React.createElement(Reacoes, { msg, operadores }),
      ),
    ),
    lightbox && React.createElement(MediaLightbox, { src: lightbox.src, tipo: lightbox.tipo, mime: lightbox.mime, nome: lightbox.nome, onClose: fecharLightbox }),
  );
}
