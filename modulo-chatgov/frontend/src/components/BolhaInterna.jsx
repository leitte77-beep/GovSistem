import React from 'react';

function formatarHora(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function BolhaInterna({ msg, isMe }) {
  return React.createElement('div', {
    style: {
      display: 'flex',
      justifyContent: isMe ? 'flex-end' : 'flex-start',
      marginBottom: 4,
      paddingLeft: isMe ? 60 : 0,
      paddingRight: isMe ? 0 : 60,
    },
  },
    React.createElement('div', {
      style: {
        background: isMe ? '#E8F0FE' : '#FFFFFF',
        color: '#0F1A2A',
        padding: '7px 11px',
        borderRadius: isMe ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
        maxWidth: '100%',
        boxShadow: '0 1px 2px rgba(16,26,42,0.08)',
      },
    },
      !isMe && React.createElement('div', {
        style: {
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 2,
          color: '#2563EB',
        },
      }, msg.remetente_nome),
      msg.tipo === 'arquivo' && msg.media_url && React.createElement('a', {
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
        style: { fontSize: 13.5, lineHeight: '19px' },
      }, msg.conteudo),
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 2,
          marginLeft: 20,
        },
      },
        React.createElement('span', {
          style: { fontSize: 10, color: '#667781', lineHeight: '15px' },
        }, formatarHora(msg.criado_em)),
      ),
    ),
  );
}
