import React, { useMemo } from 'react';
import { Smartphone, Megaphone, Hash, User } from 'lucide-react';

const CORES = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA',
];

function corPorNome(nome) {
  if (!nome) return CORES[0];
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CORES[Math.abs(hash) % CORES.length];
}

function iniciais(nome) {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/);
  if (partes.length >= 2) {
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }
  return partes[0].substring(0, 2).toUpperCase();
}

export function Avatar({ nome, url, tamanho = 40, online, tipo, isNumber }) {
  const bg = useMemo(() => corPorNome(nome), [nome]);
  const [imgErro, setImgErro] = React.useState(false);

  if (url && !imgErro) {
    return React.createElement('div', {
      style: {
        position: 'relative',
        width: tamanho,
        height: tamanho,
        flexShrink: 0,
      },
    },
      React.createElement('img', {
        src: url,
        alt: nome || '',
        onError: () => setImgErro(true),
        style: {
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          objectFit: 'cover',
        },
      }),
      online !== undefined && React.createElement('div', {
        style: {
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: tamanho * 0.35,
          height: tamanho * 0.35,
          borderRadius: '50%',
          border: '2px solid #FFFFFF',
          background: online ? '#22C55E' : '#B6C0CE',
        },
      }),
    );
  }

  if (tipo === 'grupo') {
    const Icon = tipo === 'dm' ? User : Hash;
    return React.createElement('div', {
      style: {
        width: tamanho,
        height: tamanho,
        borderRadius: '50%',
        background: '#6B7B8D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
      },
    },
      React.createElement(Icon, { size: tamanho * 0.5, color: '#fff' }),
    );
  }

  if (isNumber) {
    return React.createElement('div', {
      style: {
        width: tamanho,
        height: tamanho,
        borderRadius: '50%',
        background: '#6B7B8D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
      },
    },
      React.createElement(Smartphone, { size: tamanho * 0.45, color: '#fff' }),
    );
  }

  return React.createElement('div', {
    style: {
      width: tamanho,
      height: tamanho,
      borderRadius: '50%',
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      position: 'relative',
    },
  },
    React.createElement('span', {
      style: { color: '#fff', fontSize: tamanho * 0.38, fontWeight: 600 },
    }, iniciais(nome)),
    online !== undefined && React.createElement('div', {
      style: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: tamanho * 0.35,
        height: tamanho * 0.35,
        borderRadius: '50%',
        border: '2px solid #111B21',
        background: online ? '#25D366' : '#667781',
      },
    }),
  );
}
