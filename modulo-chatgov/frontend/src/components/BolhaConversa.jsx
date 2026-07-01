import React, { useState } from 'react';
import { Trash2, Reply, Smile } from 'lucide-react';
import { Tick } from './Tick';
import { T } from '../theme';
import { formatarHora } from '../utils/arquivo';
import { MediaPreview, MediaLightbox } from './MediaPreview';

const REACOES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function BolhaConversa({ msg, podeExcluir, onExcluir, onResponder, onReagir, respondida, nomeContato, compacto }) {
  const entrada = msg.direcao === 'entrada';
  const [hover, setHover] = useState(false);
  const [showReacoes, setShowReacoes] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  // No celular (touch) não há hover, então não precisamos reservar 60px laterais
  // para os botões de ação — isso só roubava largura útil da bolha.
  const reserva = compacto ? 8 : 60;

  const acaoIconStyle = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: T.textMuted, borderRadius: '50%' };

  const abrirLightbox = (src, t, mime, nome) => setLightbox({ src, tipo: t, mime, nome });
  const fecharLightbox = () => setLightbox(null);

  // Mensagem excluída: bolha neutra com aviso, sem conteúdo.
  if (msg.excluida) {
    return React.createElement(React.Fragment, null,
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: entrada ? 'flex-start' : 'flex-end',
          marginBottom: 4,
          paddingLeft: entrada ? 0 : reserva,
          paddingRight: entrada ? reserva : 0,
        },
      },
        React.createElement('div', {
          className: 'cg-bolha',
          style: {
            background: T.surfaceMuted, color: T.textMuted,
            padding: '6px 10px', borderRadius: 8, fontSize: 13, fontStyle: 'italic',
            border: `1px dashed ${T.border}`,
          },
        }, '🚫 Mensagem excluída'),
      ),
    );
  }

  const hasMedia = !!(msg.media_url || msg.mediaUrl);

  return React.createElement(React.Fragment, null,
    React.createElement('div', {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        display: 'flex',
        justifyContent: entrada ? 'flex-start' : 'flex-end',
        alignItems: 'center',
        gap: 6,
        marginBottom: msg.reacao ? 12 : 4,
        paddingLeft: entrada ? 0 : reserva,
        paddingRight: entrada ? reserva : 0,
      },
    },
      // Ações no hover: reagir, responder e excluir (excluir só p/ mensagens do operador/gestor).
      (hover || showReacoes) && React.createElement('div', {
        style: { order: entrada ? 1 : -1, position: 'relative', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
      },
        onReagir && React.createElement('button', {
          onClick: () => setShowReacoes((v) => !v), 'aria-label': 'Reagir', title: 'Reagir',
          style: acaoIconStyle,
        }, React.createElement(Smile, { size: 15 })),
        onResponder && React.createElement('button', {
          onClick: onResponder, 'aria-label': 'Responder', title: 'Responder',
          style: acaoIconStyle,
        }, React.createElement(Reply, { size: 15 })),
        !entrada && podeExcluir && React.createElement('button', {
          onClick: onExcluir, 'aria-label': 'Excluir mensagem', title: 'Excluir mensagem',
          style: acaoIconStyle,
        }, React.createElement(Trash2, { size: 15 })),
        showReacoes && onReagir && React.createElement('div', {
          style: {
            position: 'absolute', bottom: '100%', [entrada ? 'left' : 'right']: 0, marginBottom: 4,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20,
            boxShadow: T.shadowMd, padding: '4px 6px', display: 'flex', gap: 2, zIndex: 30,
          },
        }, REACOES_RAPIDAS.map((em) => React.createElement('button', {
          key: em, onClick: () => { onReagir(em); setShowReacoes(false); },
          style: { fontSize: 18, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 3px', lineHeight: 1 },
        }, em))),
      ),
      React.createElement('div', {
        className: 'cg-bolha',
        style: {
          background: entrada ? T.surface : '#d9fdd3',
          color: T.text,
          padding: '6px 8px 4px 8px',
          borderRadius: entrada ? '0px 8px 8px 8px' : '8px 0px 8px 8px',
          maxWidth: '100%',
          position: 'relative',
          boxShadow: '0 1px 1px rgba(17,27,33,0.06)',
        },
      },
        msg.operador_nome && !entrada && React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 },
        },
          React.createElement('span', {
            style: { fontSize: 12, fontWeight: 600, color: T.primary },
          }, msg.operador_nome),
          (msg.operador_departamentos || []).slice(0, 2).map((d) =>
            React.createElement('span', {
              key: d.nome,
              style: { fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: `${d.cor}22`, color: d.cor },
            }, d.nome)),
        ),
        // Preview da mensagem citada (responder).
        (respondida || msg.respondendo_a) && React.createElement('div', {
          style: { borderLeft: `3px solid ${T.primary}`, background: 'rgba(0,0,0,0.05)', borderRadius: 4, padding: '3px 8px', marginBottom: 4, maxWidth: 260 },
        },
          React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: T.primary } },
            respondida ? (respondida.direcao === 'saida' ? (respondida.operador_nome || 'Operador') : (nomeContato || 'Cidadão')) : 'Mensagem'),
          React.createElement('div', { style: { fontSize: 12.5, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            respondida ? (respondida.conteudo || `[${respondida.tipo || 'mídia'}]`) : '↩'),
        ),
        hasMedia && React.createElement('div', { style: { marginBottom: msg.conteudo ? 4 : 0 } },
          React.createElement(MediaPreview, { msg, isMe: !entrada, onOpenLightbox: abrirLightbox }),
        ),
        msg.conteudo && React.createElement('div', {
          style: { fontSize: 14.2, lineHeight: '19px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
        }, msg.conteudo),
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 3,
            marginTop: 2,
            marginLeft: 20,
          },
        },
          React.createElement('span', {
            style: { fontSize: 10.5, color: T.textMuted, lineHeight: '15px' },
          }, formatarHora(msg.criado_em)),
          !entrada && React.createElement(Tick, { status: msg.status }),
        ),
        // Reação (emoji) sobreposta no canto inferior da bolha.
        msg.reacao && React.createElement('span', {
          style: {
            position: 'absolute', bottom: -10, [entrada ? 'left' : 'right']: 8,
            background: T.surface, borderRadius: 12, padding: '1px 5px', fontSize: 13,
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)', border: `1px solid ${T.border}`,
          },
        }, msg.reacao),
      ),
    ),
    lightbox && React.createElement(MediaLightbox, { src: lightbox.src, tipo: lightbox.tipo, mime: lightbox.mime, nome: lightbox.nome, onClose: fecharLightbox }),
  );
}
