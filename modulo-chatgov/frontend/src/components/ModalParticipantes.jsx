import React, { useState, useEffect } from 'react';
import { UserPlus, Crown } from 'lucide-react';
import { T } from '../theme';
import { fetchParticipantes, fetchOperadores } from '../api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const card = { background: T.surface, borderRadius: T.radiusLg, padding: 24, maxWidth: 440, width: '90%', boxShadow: T.shadowLg };

export function ModalParticipantes({ conversa, onClose }) {
  const { socket } = useSocket();
  const { auth } = useAuth();
  const [participantes, setParticipantes] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [selecionados, setSelecionados] = useState([]);

  const carregar = () => {
    fetchParticipantes(conversa.id).then(setParticipantes).catch(console.error);
  };

  useEffect(() => {
    carregar();
    fetchOperadores().then(setOperadores).catch(console.error);
  }, [conversa.id]);

  const idsParticipantes = new Set(participantes.map((p) => p.operador_id));
  const disponiveis = operadores.filter((o) => !idsParticipantes.has(o.id) && o.id !== auth?.operador?.id);

  const anexar = () => {
    if (selecionados.length === 0) return;
    socket?.emit('conversa:anexar', { convId: conversa.id, operadorIds: selecionados }, (ack) => {
      if (ack?.ok) { setSelecionados([]); setTimeout(carregar, 300); }
      else alert(ack?.erro || 'Erro ao anexar');
    });
  };

  return React.createElement('div', { style: overlay },
    React.createElement('div', { style: card },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
        React.createElement('div', { style: { width: 38, height: 38, borderRadius: 10, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          React.createElement(UserPlus, { size: 20, color: T.primary })),
        React.createElement('h3', { style: { fontSize: 18, fontWeight: 700, color: T.text } }, 'Atendentes da conversa'),
      ),

      React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 6 } }, 'Já participam'),
      React.createElement('div', { style: { marginBottom: 16 } },
        participantes.length === 0
          ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted } }, 'Ninguém anexado ainda.')
          : participantes.map((p) =>
              React.createElement('div', { key: p.operador_id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 14, color: T.text } },
                React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: p.online ? T.online : T.offline } }),
                p.nome,
                p.papel === 'dono' && React.createElement(Crown, { size: 14, color: T.warning }),
              )),
      ),

      React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 6 } }, 'Adicionar atendentes'),
      React.createElement('div', { style: { maxHeight: 220, overflowY: 'auto', marginBottom: 16 } },
        disponiveis.length === 0
          ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted } }, 'Todos já participam.')
          : disponiveis.map((o) =>
              React.createElement('label', { key: o.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', fontSize: 14, color: T.text, cursor: 'pointer' } },
                React.createElement('input', {
                  type: 'checkbox', checked: selecionados.includes(o.id),
                  onChange: () => setSelecionados((prev) => prev.includes(o.id) ? prev.filter((i) => i !== o.id) : [...prev, o.id]),
                }),
                React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: o.online ? T.online : T.offline } }),
                o.nome,
              )),
      ),

      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement('button', {
          onClick: onClose,
          style: { background: 'transparent', border: `1px solid ${T.borderStrong}`, color: T.textSecondary, padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
        }, 'Fechar'),
        React.createElement('button', {
          onClick: anexar, disabled: selecionados.length === 0,
          style: { background: T.primary, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: selecionados.length === 0 ? 0.5 : 1 },
        }, 'Anexar selecionados'),
      ),
    ),
  );
}
