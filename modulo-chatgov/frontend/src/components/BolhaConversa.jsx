import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Tick } from './Tick';
import { T } from '../theme';
import { formatarHora } from '../utils/arquivo';
import { MediaPreview, MediaLightbox } from './MediaPreview';

export function BolhaConversa({ msg, podeExcluir, onExcluir }) {
  const entrada = msg.direcao === 'entrada';
  const [hover, setHover] = useState(false);
  const [lightbox, setLightbox] = useState(null);

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
          paddingLeft: entrada ? 0 : 60,
          paddingRight: entrada ? 60 : 0,
        },
      },
        React.createElement('div', {
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
        paddingLeft: entrada ? 0 : 60,
        paddingRight: entrada ? 60 : 0,
      },
    },
      // Botão excluir (aparece no hover, para mensagens do operador / gestor)
      !entrada && podeExcluir && hover && React.createElement('button', {
        onClick: onExcluir,
        'aria-label': 'Excluir mensagem',
        title: 'Excluir mensagem',
        style: { order: -1, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: T.textMuted },
      }, React.createElement(Trash2, { size: 15 })),
      React.createElement('div', {
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
