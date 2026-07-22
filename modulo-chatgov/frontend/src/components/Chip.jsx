import React from 'react';
import { T } from '../theme';

export function Chip({ label, ativo, onClick, cor, badge }) {
  return React.createElement('button', {
    onClick,
    style: {
      background: ativo ? T.primary : T.surfaceMuted,
      color: ativo ? '#fff' : T.textSecondary,
      border: 'none',
      padding: '8px 16px',
      minHeight: 44,
      borderRadius: 20,
      fontSize: 13,
      fontWeight: ativo ? 600 : 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      transition: 'all 0.15s',
    },
  },
    label,
    badge !== undefined && badge > 0 && React.createElement('span', {
      style: {
        background: ativo ? 'rgba(255,255,255,0.28)' : T.primary,
        color: '#fff',
        borderRadius: 10,
        padding: '0px 6px',
        fontSize: 11,
        fontWeight: 700,
        minWidth: 18,
        textAlign: 'center',
      },
    }, badge),
  );
}
