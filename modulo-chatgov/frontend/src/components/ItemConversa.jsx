import React from 'react';
import { Avatar } from './Avatar';
import { DeptBadge } from './DeptBadge';
import { T } from '../theme';

function formatarHora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const agora = new Date();
  const diff = agora - d;
  const dias = Math.floor(diff / 86400000);

  if (dias === 0) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } else if (dias === 1) {
    return 'Ontem';
  } else if (dias < 7) {
    return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  } else {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
}

export function ItemConversa({ conversa, ativa, onClick }) {
  const nome = conversa.contato_nome || conversa.contato_telefone || 'Desconhecido';
  const isNumber = !conversa.contato_nome;

  return React.createElement('div', {
    onClick,
    style: {
      display: 'flex',
      padding: '12px 12px',
      cursor: 'pointer',
      alignItems: 'center',
      gap: 12,
      transition: 'background 0.12s',
      background: ativa ? T.primarySoft : 'transparent',
      borderRadius: T.radiusSm,
      marginBottom: 1,
      borderBottom: ativa ? 'none' : `1px solid #f0f2f5`,
    },
  },
    React.createElement(Avatar, { nome, tamanho: 46, isNumber }),
    React.createElement('div', {
      style: { flex: 1, minWidth: 0 },
    },
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
      },
        React.createElement('span', {
          style: { fontSize: 15, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        }, nome),
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
        },
          conversa.departamento_nome && React.createElement(DeptBadge, { nome: conversa.departamento_nome, cor: conversa.departamento_cor }),
          React.createElement('span', {
            style: { fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' },
          }, formatarHora(conversa.ultima_mensagem_em)),
        ),
      ),
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
      },
        React.createElement('span', {
          style: {
            fontSize: 13,
            color: T.textSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            marginRight: 8,
          },
        }, conversa.ultima_mensagem || ''),
        conversa.nao_lidas > 0 && React.createElement('span', {
          style: {
            background: T.whatsappGreen,
            color: '#fff',
            borderRadius: 12,
            minWidth: 22,
            height: 22,
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            padding: '0 5px',
          },
        }, conversa.nao_lidas > 99 ? '99+' : conversa.nao_lidas),
      ),
    ),
  );
}
