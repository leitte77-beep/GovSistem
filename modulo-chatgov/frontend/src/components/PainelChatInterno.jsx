import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Smile, Headphones } from 'lucide-react';
import { Avatar } from './Avatar';
import { BolhaInterna } from './BolhaInterna';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { fetchMensagensInternas } from '../api';
import { T } from '../theme';

export function PainelChatInterno({ canal }) {
  const { socket } = useSocket();
  const { auth } = useAuth();
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const areaMensagensRef = useRef(null);

  const opId = auth?.operador?.id;

  useEffect(() => {
    if (!canal) return;
    setMensagens([]);
    fetchMensagensInternas(canal.id).then(setMensagens).catch(console.error);
    socket?.emit('interno:abrir', canal.id);
  }, [canal?.id, socket]);

  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => setMensagens((prev) => [...prev, msg]);
    socket.on('interno:nova', handler);
    return () => socket.off('interno:nova', handler);
  }, [socket]);

  useEffect(() => {
    if (areaMensagensRef.current) areaMensagensRef.current.scrollTop = areaMensagensRef.current.scrollHeight;
  }, [mensagens]);

  const enviar = (e) => {
    e?.preventDefault();
    const txt = texto.trim();
    if (!txt || !canal) return;
    socket?.emit('interno:enviar', { canalId: canal.id, conteudo: txt });
    setTexto('');
  };

  if (!canal) {
    return React.createElement('div', {
      style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, background: T.bg },
    },
      React.createElement('div', { style: { width: 88, height: 88, borderRadius: 24, background: 'linear-gradient(135deg,#0D9488 0%,#0891B2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(13,148,136,0.3)' } },
        React.createElement(Headphones, { size: 44, color: '#fff' })),
      React.createElement('h1', { style: { fontSize: 24, fontWeight: 800, color: T.text, letterSpacing: -0.5 } }, 'Chat interno da equipe'),
      React.createElement('p', { style: { fontSize: 14, color: T.textMuted, textAlign: 'center', maxWidth: 380 } }, 'Converse com colegas e secretarias. Nada aqui sai pelo WhatsApp.'),
    );
  }

  const nome = canal.tipo === 'dm'
    ? (canal.membros?.find((m) => m.id !== opId)?.nome || 'Conversa')
    : (canal.nome || 'Grupo');
  const subtitle = canal.tipo === 'dm' ? '' : `${canal.membros?.length || 0} participantes`;

  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg } },
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', padding: '12px 20px', background: T.surface, gap: 12, flexShrink: 0, borderBottom: `1px solid ${T.border}` },
    },
      React.createElement(Avatar, { nome, tamanho: 42, tipo: canal.tipo }),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: T.text } }, nome),
        subtitle && React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, subtitle),
      ),
    ),
    React.createElement('div', {
      style: { padding: '7px 16px', background: T.surfaceAlt, fontSize: 11, textAlign: 'center', color: T.textMuted, flexShrink: 0, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
    },
      React.createElement(Headphones, { size: 12 }), 'Conversa interna da equipe — não sai pelo WhatsApp'),
    React.createElement('div', { ref: areaMensagensRef, style: { flex: 1, overflowY: 'auto', padding: '20px 24px' } },
      mensagens.map((msg) => React.createElement(BolhaInterna, { key: msg.id, msg, isMe: msg.remetente_id === opId })),
    ),
    React.createElement('form', {
      onSubmit: enviar,
      style: { display: 'flex', alignItems: 'center', padding: '12px 16px', background: T.surface, gap: 10, flexShrink: 0, borderTop: `1px solid ${T.border}` },
    },
      React.createElement('button', { type: 'button', style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' } }, React.createElement(Smile, { size: 22, color: T.textMuted })),
      React.createElement('button', { type: 'button', style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' } }, React.createElement(Paperclip, { size: 22, color: T.textMuted })),
      React.createElement('input', {
        value: texto, onChange: (e) => setTexto(e.target.value), placeholder: 'Digite uma mensagem',
        style: { flex: 1, background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: 22, padding: '11px 16px', color: T.text, fontSize: 14, outline: 'none' },
      }),
      React.createElement('button', {
        type: 'submit',
        style: { width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', background: texto.trim() ? T.primary : T.surfaceMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }, React.createElement(Send, { size: 20, color: texto.trim() ? '#fff' : T.textMuted })),
    ),
  );
}
