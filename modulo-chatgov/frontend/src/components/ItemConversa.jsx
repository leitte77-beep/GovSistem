import React from 'react';
import { Pin } from 'lucide-react';
import { Avatar } from './Avatar';
import { DeptBadge } from './DeptBadge';
import { T } from '../theme';
import { formatarHoraRelativa } from '../utils/arquivo';
import { CONVERSA_STATUS_UI, conversationStatus } from '../domain/status';

export function ItemConversa({ conversa, ativa, opId, onClick, fixada, onFixar }) {
  const nome = conversa.contato_nome || conversa.contato_telefone || 'Desconhecido';
  const isNumber = !conversa.contato_nome;
  const minha = opId && conversa.operador_id === opId;
  const status = conversationStatus(conversa);
  const statusUi = CONVERSA_STATUS_UI[status];
  const naoLidas = conversa.nao_lidas || 0;
  // Quem está atendendo aparece no tooltip da linha inteira: informa sem gastar
  // espaço numa lista que já está densa.
  const responsavel = conversa.operador_nome
    ? `Em atendimento por ${conversa.operador_nome}`
    : 'Sem atendente responsável';

  return React.createElement('div', {
    onClick,
    title: `${nome} — ${statusUi?.label || status}. ${responsavel}.`,
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
      borderBottom: ativa ? 'none' : `1px solid ${T.border}`,
      // Faixa à esquerda destacando conversas atribuídas a mim.
      borderLeft: minha ? `3px solid ${T.primary}` : '3px solid transparent',
      opacity: status === 'ARQUIVADA' ? 0.6 : 1,
      // Não lida ganha fundo levemente destacado (o negrito vai no nome e na prévia).
      background: !ativa && naoLidas > 0 ? T.primarySoft : undefined,
      position: 'relative',
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
          style: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: naoLidas > 0 ? 800 : 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 },
        },
          fixada && React.createElement(Pin, { size: 12, color: T.primary, style: { flexShrink: 0 }, fill: T.primary }),
          React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, nome),
        ),
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 },
        },
          onFixar && React.createElement('button', {
            className: 'cg-conv-fixar',
            title: fixada ? 'Desafixar do topo' : 'Fixar no topo da lista',
            'aria-label': fixada ? 'Desafixar conversa' : 'Fixar conversa no topo',
            onClick: (e) => { e.stopPropagation(); onFixar(conversa.id); },
            style: {
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 2,
              display: 'flex', color: fixada ? T.primary : T.textMuted, borderRadius: 4,
            },
          }, React.createElement(Pin, { size: 13, fill: fixada ? T.primary : 'none' })),
          minha && React.createElement('span', {
            title: 'Atribuída a você',
            style: { fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 6, background: T.primarySoft, color: T.primary, textTransform: 'uppercase', letterSpacing: 0.3 },
          }, 'Minha'),
          statusUi && React.createElement('span', {
            title: `Status operacional: ${statusUi.label}`,
            'aria-label': `Status ${statusUi.label}`,
            style: {
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
              background: statusUi.background, color: statusUi.color,
              textTransform: 'uppercase', letterSpacing: 0.3,
            },
          }, statusUi.label),
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
            color: naoLidas > 0 ? T.text : T.textSecondary,
            fontWeight: naoLidas > 0 ? 600 : 400,
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
