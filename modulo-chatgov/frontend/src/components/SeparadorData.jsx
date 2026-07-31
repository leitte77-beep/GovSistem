import React from 'react';
import { T } from '../theme';

/**
 * Separador de data estilo WhatsApp.
 * Exibe um rotulo centralizado (ex: "Hoje", "Ontem", "Segunda-feira", "25/06/2026")
 * com fundo em formato de capsula e margens simetricas.
 */
export function SeparadorData({ label }) {
  if (!label) return null;
  return React.createElement('div', {
    style: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '8px 0',
      userSelect: 'none',
    },
  },
    React.createElement('span', {
      style: {
        background: T.surface,
        color: T.textMuted,
        fontSize: 12,
        fontWeight: 500,
        padding: '4px 12px',
        borderRadius: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
      },
    }, label),
  );
}
