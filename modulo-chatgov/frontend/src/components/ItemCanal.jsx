import React from 'react';
import { Avatar } from './Avatar';
import { T } from '../theme';

export function ItemCanal({ canal, ativo, opId, onClick }) {
  const outroMembro = canal.tipo === 'dm' ? canal.membros?.find((m) => m.id !== opId) : null;
  const nome = canal.tipo === 'dm' ? (outroMembro?.nome || 'Conversa') : (canal.nome || 'Grupo');

  return React.createElement('div', {
    onClick,
    style: {
      display: 'flex', padding: '12px 12px', cursor: 'pointer', alignItems: 'center', gap: 12,
      transition: 'background 0.12s', background: ativo ? T.primarySoft : 'transparent',
      borderRadius: T.radiusSm, marginBottom: 1,
      borderBottom: ativo ? 'none' : `1px solid #f0f2f5`,
    },
  },
    React.createElement(Avatar, { nome, tamanho: 46, tipo: canal.tipo, online: outroMembro?.online }),
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', { style: { fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 3 } }, nome),
      React.createElement('div', { style: { fontSize: 13, color: T.textSecondary } },
        canal.tipo === 'grupo'
          ? `${canal.membros?.length || 0} participantes`
          : (outroMembro?.online ? 'online' : 'offline')),
    ),
  );
}
