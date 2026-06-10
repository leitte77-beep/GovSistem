import React from 'react';

export function DeptBadge({ nome, cor }) {
  return React.createElement('span', {
    style: {
      fontSize: 10,
      color: cor || '#00A884',
      background: `${cor || '#00A884'}15`,
      padding: '1px 6px',
      borderRadius: 4,
      fontWeight: 500,
      flexShrink: 0,
    },
  }, nome || '');
}
