import React from 'react';
import { Avatar } from './Avatar';
import { DeptBadge } from './DeptBadge';
import { T } from '../theme';
import { formatarHoraRelativa } from '../utils/arquivo';

export function ItemConversa({ conversa, ativa, opId, onClick }) {
  const nome = conversa.contato_nome || conversa.contato_telefone || 'Desconhecido';
  const isNumber = !conversa.contato_nome;
  const minha = opId && conversa.operador_id === opId;

  return React.createElement('div', {
    onClick,
    // Fundo (incl. estado ativo) controlado por CSS p/ o :hover ter efeito — ver index.html
    className: 'cg-conv-item' + (ativa ? ' ativa' : ''),
    style: {
      display: 'flex',
      padding: '12px 12px',
      cursor: 'pointer',
      alignItems: 'center',
      gap: 12,
      borderRadius: T.radiusSm,
      marginBottom: 1,
      borderBottom: ativa ? 'none' : `1px solid #f0f2f5`,
      // Faixa à esquerda destacando conversas atribuídas a mim.
      borderLeft: minha ? `3px solid ${T.primary}` : '3px solid transparent',
      opacity: conversa.status === 'arquivada' ? 0.6 : 1,
    },
  },
    React.createElement(Avatar, { nome, url: conversa.contato_avatar_url, tamanho: 46, isNumber }),
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
          minha && React.createElement('span', {
            title: 'Atribuída a você',
            style: { fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 6, background: T.primarySoft, color: T.primary, textTransform: 'uppercase', letterSpacing: 0.3 },
          }, 'Minha'),
          conversa.status === 'arquivada' && React.createElement('span', {
            title: 'Conversa arquivada automaticamente após inatividade',
            style: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: T.surfaceMuted, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
          }, 'Arquivada'),
          conversa.departamento_nome && React.createElement(DeptBadge, { nome: conversa.departamento_nome, cor: conversa.departamento_cor }),
          React.createElement('span', {
            style: { fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' },
          }, formatarHoraRelativa(conversa.ultima_mensagem_em)),
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
