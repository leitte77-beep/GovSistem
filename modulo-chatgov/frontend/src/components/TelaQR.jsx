import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { T } from '../theme';

export function TelaQR({ onClose }) {
  const { socket } = useSocket();
  const [qr, setQr] = useState(null);
  const [status, setStatus] = useState('carregando');

  useEffect(() => {
    if (!socket) return;

    socket.on('whatsapp:qr', (data) => {
      setQr(data.qr);
      setStatus('qr');
    });

    socket.on('whatsapp:conectado', () => {
      setStatus('conectado');
    });

    socket.on('whatsapp:desconectado', () => {
      setStatus('desconectado');
    });

    socket.emit('whatsapp:solicitarQR');

    return () => {
      socket.off('whatsapp:qr');
      socket.off('whatsapp:conectado');
      socket.off('whatsapp:desconectado');
    };
  }, [socket]);

  return React.createElement('div', {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
  },
    React.createElement('div', {
      style: {
        background: '#FFFFFF',
        borderRadius: 16,
        padding: 40,
        maxWidth: 420,
        width: '90%',
        position: 'relative',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(16,26,42,0.20)',
      },
    },
      React.createElement('button', {
        onClick: onClose,
        style: {
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          borderRadius: '50%',
        },
      }, React.createElement(X, { size: 20, color: '#54656f' })),
      React.createElement('span', {
        className: 'material-symbols-outlined',
        style: { fontSize: 40, display: 'block', marginBottom: 16, color: T.whatsappGreen, fontVariationSettings: "'FILL' 0" },
      }, 'qr_code_2'),
      React.createElement('h2', {
        style: {
          fontSize: 20,
          fontWeight: 700,
          color: T.text,
          marginBottom: 8,
        },
      }, 'Conectar WhatsApp'),
      status === 'conectado' && React.createElement('p', {
        style: { color: T.whatsappGreen, fontSize: 14, marginBottom: 12, fontWeight: 600 },
      }, 'WhatsApp conectado com sucesso!'),
      status === 'qr' && qr && React.createElement('img', {
        src: qr,
        alt: 'QR Code',
        style: { width: 220, height: 220, margin: '0 auto 16px', display: 'block' },
      }),
      status === 'carregando' && React.createElement('p', {
        style: { color: T.textSecondary, fontSize: 14, marginBottom: 12 },
      }, 'Gerando c\u00f3digo QR...'),
      status === 'desconectado' && React.createElement('p', {
        style: { color: T.danger, fontSize: 14, marginBottom: 12 },
      }, 'WhatsApp desconectado. Tente reconectar.'),
      React.createElement('div', {
        style: { textAlign: 'left', color: T.textSecondary, fontSize: 13 },
      },
        React.createElement('p', { style: { marginBottom: 4 } }, '1. Abra o WhatsApp no celular'),
        React.createElement('p', { style: { marginBottom: 4 } }, '2. Toque em Aparelhos conectados'),
        React.createElement('p', { style: { marginBottom: 4 } }, '3. Toque em Conectar um aparelho'),
        React.createElement('p', { style: { marginBottom: 16 } }, '4. Aponte a camera para o QR code'),
      ),
      React.createElement('button', {
        onClick: () => {
          setQr(null);
          setStatus('carregando');
          socket?.emit('whatsapp:solicitarQR');
        },
        style: {
          background: T.primary,
          color: '#fff',
          border: 'none',
          padding: '10px 24px',
          borderRadius: 20,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        },
      }, 'Gerar novo c\u00f3digo'),
    ),
  );
}
