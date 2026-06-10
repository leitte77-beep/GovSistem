import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Smile, Reply, MoreHorizontal, Pin, Trash2, Edit3, Forward } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { fetchMensagensInternas, fetchCanaisInternos } from '../api';
import { fetchMensagensFixadas } from '../api/evolucoes';
import { T } from '../theme';

const EMOJIS_RAPIDOS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function formatarHora(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function PainelChatInternoAvancado({ canal }) {
  const { socket } = useSocket();
  const { auth } = useAuth();
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [fixadas, setFixadas] = useState([]);
  const [respondendoA, setRespondendoA] = useState(null);
  const [editando, setEditando] = useState(null);
  const [menuMsg, setMenuMsg] = useState(null);
  const [showEmoji, setShowEmoji] = useState(null);
  const areaMensagensRef = useRef(null);
  const typingTimerRef = useRef(null);

  const opId = auth?.operador?.id;

  useEffect(() => {
    if (!canal) return;
    setMensagens([]);
    setFixadas([]);
    setRespondendoA(null);
    setEditando(null);
    fetchMensagensInternas(canal.id).then(setMensagens).catch(console.error);
    fetchMensagensFixadas(canal.id).then(setFixadas).catch(console.error);
    socket?.emit('interno:abrir', canal.id);
    socket?.emit('mensagem:ler', { canalId: canal.id });
  }, [canal?.id, socket]);

  useEffect(() => {
    if (!socket) return;
    const onNova = (msg) => setMensagens((prev) => [...prev, msg]);
    const onEditada = (msg) => setMensagens((prev) => prev.map((m) => m.id === msg.id ? { ...m, conteudo: msg.conteudo, editada: true, editada_em: msg.editada_em } : m));
    const onExcluida = ({ msgId }) => setMensagens((prev) => prev.map((m) => m.id === msgId ? { ...m, excluida: true, conteudo: 'Mensagem excluída' } : m));
    const onReacao = ({ msgId, emoji, operadorId, acao }) => {
      setMensagens((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        const reacoes = m._reacoes || {};
        const atual = reacoes[emoji] || [];
        const nova = acao === 'adicionar' ? [...atual, operadorId] : atual.filter((id) => id !== operadorId);
        if (nova.length === 0) { delete reacoes[emoji]; } else { reacoes[emoji] = nova; }
        return { ...m, _reacoes: { ...reacoes } };
      }));
    };

    socket.on('interno:nova', onNova);
    socket.on('mensagem:editada', onEditada);
    socket.on('mensagem:excluida', onExcluida);
    socket.on('mensagem:reacao', onReacao);
    socket.on('canais:fixada', () => fetchMensagensFixadas(canal?.id).then(setFixadas).catch(console.error));
    socket.on('canais:desafixada', () => fetchMensagensFixadas(canal?.id).then(setFixadas).catch(console.error));

    return () => {
      socket.off('interno:nova', onNova);
      socket.off('mensagem:editada', onEditada);
      socket.off('mensagem:excluida', onExcluida);
      socket.off('mensagem:reacao', onReacao);
      socket.off('canais:fixada');
      socket.off('canais:desafixada');
    };
  }, [socket, canal?.id]);

  useEffect(() => {
    if (areaMensagensRef.current) areaMensagensRef.current.scrollTop = areaMensagensRef.current.scrollHeight;
  }, [mensagens]);

  const handleTyping = useCallback(() => {
    socket?.emit('interno:digitando', { canalId: canal?.id });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket?.emit('interno:digitando:parou', { canalId: canal?.id });
    }, 3000);
  }, [socket, canal?.id]);

  const enviar = (e) => {
    e?.preventDefault();
    const txt = texto.trim();
    if (!txt || !canal) return;
    if (editando) {
      socket?.emit('mensagem:editar', { canalId: canal.id, msgId: editando.id, conteudo: txt }, (res) => {
        if (res?.ok) { setEditando(null); setTexto(''); }
      });
      return;
    }
    socket?.emit('interno:responder', {
      canalId: canal.id,
      conteudo: txt,
      respondendoA: respondendoA?.id || null,
    });
    setTexto('');
    setRespondendoA(null);
  };

  const handleReagir = (msgId, emoji) => {
    socket?.emit('mensagem:reagir', { canalId: canal?.id, msgId, emoji });
    setShowEmoji(null);
    setMenuMsg(null);
  };

  const handleFixar = (msgId) => {
    socket?.emit('mensagem:fixar', { canalId: canal?.id, msgId });
    setMenuMsg(null);
  };

  const handleExcluir = (msgId) => {
    socket?.emit('mensagem:excluir', { canalId: canal?.id, msgId });
    setMenuMsg(null);
  };

  const iniciarEdicao = (msg) => {
    setEditando(msg);
    setTexto(msg.conteudo);
    setMenuMsg(null);
  };

  const cancelarEdicao = () => {
    setEditando(null);
    setTexto('');
  };

  const iniciarResposta = (msg) => {
    setRespondendoA(msg);
    setMenuMsg(null);
  };

  const handleEncaminhar = (msgId) => {
    const destino = prompt('ID do canal de destino:');
    if (destino) {
      socket?.emit('mensagem:encaminhar', { msgId, canalDestinoId: destino });
    }
    setMenuMsg(null);
  };

  if (!canal) {
    return React.createElement('div', {
      style: {
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        backgroundColor: '#f0f2f5',
        backgroundImage: 'radial-gradient(#d1d7db 0.5px, transparent 0.5px)',
        backgroundSize: '20px 20px',
      },
    },
      React.createElement('div', {
        style: { textAlign: 'center', position: 'relative', zIndex: 10 },
      },
        React.createElement('span', {
          className: 'material-symbols-outlined',
          style: { fontSize: 64, display: 'block', marginBottom: 16, color: '#d1d7db', fontVariationSettings: "'FILL' 0" },
        }, 'forum'),
        React.createElement('p', { style: { fontSize: 14, color: T.textMuted } }, 'Selecione um canal para conversar'),
      ),
    );
  }

  const nome = canal.tipo === 'dm'
    ? (canal.membros?.find((m) => m.id !== opId)?.nome || 'Conversa')
    : (canal.nome || 'Grupo');

  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', padding: '10px 16px', background: T.surface, gap: 10, flexShrink: 0, borderBottom: '1px solid #d1d7db', minHeight: 56 } },
      React.createElement('div', { style: { width: 36, height: 36, borderRadius: '50%', background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 } }, nome[0]?.toUpperCase()),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: T.text } }, nome),
        React.createElement('div', { style: { fontSize: 11, color: T.textMuted } }, canal.descricao || ''),
      ),
    ),
    // Fixed messages banner
    fixadas.length > 0 && React.createElement('div', { style: { padding: '6px 12px', background: '#FFF3CD', borderBottom: `1px solid #FFE69C`, fontSize: 12, display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 } },
      React.createElement(Pin, { size: 12, color: '#856404' }),
      ...fixadas.map((f) => React.createElement('span', { key: f.id, style: { color: '#856404', whiteSpace: 'nowrap' } }, f.conteudo?.slice(0, 60) + (f.conteudo?.length > 60 ? '...' : ''))),
    ),
    // Reply indicator
    respondendoA && React.createElement('div', { style: { padding: '8px 16px', background: T.surfaceMuted, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMuted, flexShrink: 0, borderBottom: `1px solid ${T.border}` } },
      React.createElement(Reply, { size: 14 }),
      React.createElement('span', null, `Respondendo a ${respondendoA.remetente_nome || 'mensagem'}`),
      React.createElement('button', { onClick: () => setRespondendoA(null), style: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 14 } }, '✕'),
    ),
    // Messages area
    React.createElement('div', { ref: areaMensagensRef, style: {
      flex: 1, overflowY: 'auto', padding: '16px 16px',
      backgroundColor: '#f0f2f5',
      backgroundImage: 'radial-gradient(#d1d7db 0.5px, transparent 0.5px)',
      backgroundSize: '20px 20px',
    } },
      mensagens.map((msg) => {
        const isMe = msg.remetente_id === opId;
        return React.createElement('div', { key: msg.id, style: { position: 'relative', marginBottom: 6 } },
          // Thread reply reference
          msg.respondendo_a && React.createElement('div', { style: { fontSize: 11, color: T.textMuted, marginBottom: 2, paddingLeft: 8, borderLeft: `2px solid ${T.primary}` } },
            React.createElement(Reply, { size: 10 }), ' Em resposta a uma mensagem anterior'),
          React.createElement('div', {
            style: {
              display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start',
              paddingLeft: isMe ? 60 : 0, paddingRight: isMe ? 0 : 60,
            },
            onMouseEnter: () => setMenuMsg(msg.id),
            onMouseLeave: () => setMenuMsg(null),
          },
            React.createElement('div', { style: { background: isMe ? '#DCF8C6' : '#FFFFFF', color: T.text, padding: '6px 10px', borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px', maxWidth: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', position: 'relative' } },
              !isMe && msg.remetente_nome && React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: T.primary, marginBottom: 2 } }, msg.remetente_nome),
              msg.excluida
                ? React.createElement('span', { style: { fontStyle: 'italic', color: T.textMuted } }, 'Mensagem excluída')
                : React.createElement('span', { style: { fontSize: 14, lineHeight: '20px', whiteSpace: 'pre-wrap' } }, msg.conteudo),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 } },
                msg.editada && React.createElement('span', { style: { fontSize: 10, color: T.textMuted } }, '(editado)'),
                React.createElement('span', { style: { fontSize: 10, color: T.textMuted } }, formatarHora(msg.criado_em)),
              ),
              // Reactions display
              msg._reacoes && Object.keys(msg._reacoes).length > 0 && React.createElement('div', { style: { display: 'flex', gap: 2, marginTop: 2, flexWrap: 'wrap' } },
                Object.entries(msg._reacoes).map(([emoji, users]) =>
                  React.createElement('span', { key: emoji, style: { background: T.surfaceMuted, borderRadius: 8, padding: '1px 6px', fontSize: 12, cursor: 'pointer' }, title: users.join(', ') }, `${emoji} ${users.length}`)
                ),
              ),
            ),
          ),
          // Context menu on hover
          menuMsg === msg.id && !msg.excluida && React.createElement('div', { style: { position: 'absolute', top: -4, right: isMe ? 8 : 'auto', left: isMe ? 'auto' : 8, display: 'flex', gap: 2, background: T.surface, borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 2, zIndex: 10 } },
            // Emoji picker toggle
            React.createElement('button', { onClick: () => setShowEmoji(showEmoji === msg.id ? null : msg.id), style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' } },
              React.createElement(Smile, { size: 14, color: T.textMuted })),
            React.createElement('button', { onClick: () => iniciarResposta(msg), style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' } },
              React.createElement(Reply, { size: 14, color: T.textMuted })),
            React.createElement('button', { onClick: () => handleFixar(msg.id), style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' } },
              React.createElement(Pin, { size: 14, color: T.textMuted })),
            isMe && React.createElement('button', { onClick: () => iniciarEdicao(msg), style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' } },
              React.createElement(Edit3, { size: 14, color: T.textMuted })),
            isMe && React.createElement('button', { onClick: () => handleExcluir(msg.id), style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' } },
              React.createElement(Trash2, { size: 14, color: '#EF4444' })),
            React.createElement('button', { onClick: () => handleEncaminhar(msg.id), style: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' } },
              React.createElement(Forward, { size: 14, color: T.textMuted })),
          ),
          // Emoji picker
          showEmoji === msg.id && React.createElement('div', { style: { display: 'flex', gap: 4, padding: 4, background: T.surface, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', position: 'absolute', bottom: 28, right: isMe ? 8 : 'auto', left: isMe ? 'auto' : 8, zIndex: 20 } },
            ...EMOJIS_RAPIDOS.map((emoji) =>
              React.createElement('button', { key: emoji, onClick: () => handleReagir(msg.id, emoji), style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 2 } }, emoji)
            ),
          ),
        );
      }),
    ),
    // Edit indicator
    editando && React.createElement('div', { style: { padding: '6px 16px', background: '#FFF3CD', fontSize: 12, color: '#856404', flexShrink: 0 } },
      'Editando mensagem — ',
      React.createElement('button', { onClick: cancelarEdicao, style: { background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', fontSize: 12 } }, 'Cancelar'),
    ),
    // Input area
    React.createElement('form', {
      onSubmit: enviar,
      style: { display: 'flex', alignItems: 'center', padding: '10px 14px', background: T.surface, gap: 8, flexShrink: 0, borderTop: `1px solid ${T.border}` },
    },
      React.createElement('input', {
        value: texto, onChange: (e) => { setTexto(e.target.value); handleTyping(); },
        placeholder: editando ? 'Editando mensagem...' : respondendoA ? 'Responder...' : 'Digite uma mensagem',
        style: { flex: 1, background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: 20, padding: '8px 14px', color: T.text, fontSize: 14, outline: 'none' },
      }),
      React.createElement('button', {
        type: 'submit',
        style: { width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', background: texto.trim() ? T.primary : T.surfaceMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      }, React.createElement(Send, { size: 18, color: texto.trim() ? '#fff' : T.textMuted })),
    ),
  );
}
