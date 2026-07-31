import React, { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { T } from '../theme';
import { fetchOperadores } from '../api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const card = { background: T.surface, borderRadius: T.radiusLg, padding: 24, maxWidth: 440, width: '90%', boxShadow: T.shadowLg };

export function ModalTransferir({ conversa, onClose, onTransferido }) {
  const { socket } = useSocket();
  const { auth } = useAuth();
  const [operadores, setOperadores] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetchOperadores().then(setOperadores).catch(console.error);
  }, []);

  const disponiveis = operadores.filter((o) => o.id !== auth?.operador?.id);

  const transferir = () => {
    if (!selecionado) return;
    setEnviando(true);
    socket?.emit('conversa:transferir', { convId: conversa.id, paraOperadorId: selecionado, motivo: motivo.trim() || null }, (ack) => {
      setEnviando(false);
      if (ack?.ok) { onTransferido?.(); onClose?.(); }
      else alert(ack?.erro || 'Erro ao transferir');
    });
  };

  return React.createElement('div', { style: overlay },
    React.createElement('div', { style: card },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
        React.createElement('div', { style: { width: 38, height: 38, borderRadius: 10, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          React.createElement(ArrowRightLeft, { size: 20, color: T.primary })),
        React.createElement('h3', { style: { fontSize: 18, fontWeight: 700, color: T.text } }, 'Transferir conversa'),
      ),

      React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginBottom: 12 } },
        'O atendente escolhido recebe uma solicitação e pode aceitar ou recusar. Enquanto não aceitar, a conversa continua com você.'),

      React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 6 } }, 'Transferir para'),
      React.createElement('div', { style: { maxHeight: 220, overflowY: 'auto', marginBottom: 14, border: `1px solid ${T.border}`, borderRadius: T.radiusSm } },
        disponiveis.length === 0
          ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted, padding: 12 } }, 'Nenhum outro atendente disponível.')
          : disponiveis.map((o) =>
              React.createElement('label', { key: o.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', fontSize: 14, color: T.text, cursor: 'pointer', background: selecionado === o.id ? T.primarySoft : 'transparent' } },
                React.createElement('input', { type: 'radio', name: 'alvo', checked: selecionado === o.id, onChange: () => setSelecionado(o.id) }),
                React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: o.online ? T.online : T.offline } }),
                o.nome,
              )),
      ),

      React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 6 } }, 'Motivo (opcional)'),
      React.createElement('textarea', {
        value: motivo, onChange: (e) => setMotivo(e.target.value), rows: 2,
        placeholder: 'Ex.: cliente é do seu bairro / você já atendeu antes...',
        style: { width: '100%', resize: 'vertical', fontSize: 13, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none', marginBottom: 16, fontFamily: 'inherit' },
      }),

      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement('button', {
          onClick: onClose,
          style: { background: 'transparent', border: `1px solid ${T.borderStrong}`, color: T.textSecondary, padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
        }, 'Cancelar'),
        React.createElement('button', {
          onClick: transferir, disabled: !selecionado || enviando,
          style: { background: T.primary, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (!selecionado || enviando) ? 0.5 : 1 },
        }, enviando ? 'Enviando...' : 'Transferir'),
      ),
    ),
  );
}
