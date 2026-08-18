import React from 'react';
import { T } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { corLegivel, sobrepor } from '../utils/contraste';

const COR_PADRAO = '#00A884';

export function DeptBadge({ nome, cor }) {
  const { isDark } = useTheme();
  const base = cor || COR_PADRAO;
  // O fundo é a própria cor a 8% sobre a superfície do card — é contra ele que
  // o texto precisa contrastar, não contra a cor pura.
  const fundo = sobrepor(base, 0x15 / 255, T.surface);
  return React.createElement('span', {
    style: {
      fontSize: 10,
      color: corLegivel(base, fundo, !isDark, 4.5),
      background: `${base}15`,
      padding: '1px 6px',
      borderRadius: 4,
      fontWeight: 500,
      flexShrink: 0,
    },
  }, nome || '');
}
