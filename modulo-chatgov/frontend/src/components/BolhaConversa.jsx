import React from 'react';
import { Tick } from './Tick';
import { T } from '../theme';

function formatarHora(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function BolhaConversa({ msg }) {
  const entrada = msg.direcao === 'entrada';

  return React.createElement('div', {
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
        background: entrada ? '#FFFFFF' : '#d9fdd3',
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
          style: { fontSize: 12, fontWeight: 600, color: '#2563EB' },
        }, msg.operador_nome),
        (msg.operador_departamentos || []).slice(0, 2).map((d) =>
          React.createElement('span', {
            key: d.nome,
            style: { fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: `${d.cor}22`, color: d.cor },
          }, d.nome)),
      ),
      msg.tipo === 'imagem' && msg.media_url && React.createElement('img', {
        src: msg.media_url,
        alt: 'Imagem',
        style: {
          maxWidth: 300,
          maxHeight: 300,
          borderRadius: 4,
          marginBottom: msg.conteudo ? 4 : 0,
          display: 'block',
        },
      }),
      msg.tipo === 'video' && msg.media_url && React.createElement('video', {
        src: msg.media_url,
        controls: true,
        style: {
          maxWidth: 300,
          maxHeight: 300,
          borderRadius: 4,
          display: 'block',
        },
      }),
      msg.tipo === 'audio' && msg.media_url && React.createElement('audio', {
        src: msg.media_url,
        controls: true,
        style: { display: 'block' },
      }),
      msg.tipo === 'documento' && msg.media_url && React.createElement('a', {
        href: msg.media_url,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: '#fff',
          borderRadius: 4,
          color: '#111B21',
          textDecoration: 'none',
          fontSize: 13,
          border: '1px solid #E9EDEF',
        },
      },
        React.createElement('span', null, '\uD83D\uDCCE'),
        React.createElement('span', null, 'Arquivo'),
      ),
      msg.conteudo && React.createElement('div', {
        style: { fontSize: 14.2, lineHeight: '19px' },
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
          style: { fontSize: 10.5, color: '#667781', lineHeight: '15px' },
        }, formatarHora(msg.criado_em)),
        !entrada && React.createElement(Tick, { status: msg.status }),
      ),
    ),
  );
}
