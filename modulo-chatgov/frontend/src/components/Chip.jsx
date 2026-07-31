import React from 'react';
import { T } from '../theme';

export function Chip({ label, ativo, onClick, cor, badge }) {
  return React.createElement('button', {
    onClick,
    type: 'button',
    'aria-pressed': ativo,
    'aria-label': badge !== undefined ? `${label}: ${badge}` : label,
    style: {
      background: ativo ? T.primary : T.surfaceMuted,
      color: ativo ? '#fff' : T.textSecondary,
      border: 'none',
      padding: '7px 11px',
      minHeight: 38,
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
    badge !== undefined && React.createElement('span', {
      style: {
        background: ativo ? 'rgba(255,255,255,0.28)' : T.surface,
        color: ativo ? '#fff' : T.textSecondary,
        border: ativo ? 'none' : `1px solid ${T.borderStrong}`,
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
