import React from 'react';
import { MessageCircle } from 'lucide-react';

export function EstadoVazio({ icon, title, subtitle }) {
  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 8,
      padding: 20,
    },
  },
    React.createElement(icon || MessageCircle, { size: 64, color: '#667781', strokeWidth: 1 }),
    React.createElement('h1', {
      style: {
        fontSize: 32,
        fontWeight: 300,
        color: '#E9EDEF',
        textAlign: 'center',
      },
    }, title || 'ChatGov'),
    subtitle && React.createElement('p', {
      style: {
        fontSize: 14,
        color: '#667781',
        textAlign: 'center',
        maxWidth: 400,
        lineHeight: '20px',
      },
    }, subtitle),
  );
}
