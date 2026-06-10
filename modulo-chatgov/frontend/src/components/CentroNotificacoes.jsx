import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, MessageCircle, CheckSquare, Video, FileText, AlertCircle } from 'lucide-react';
import { fetchNotificacoes, fetchContagemNotificacoes, marcarNotificacaoLidaApi, marcarTodasNotificacoesLidas } from '../api/evolucoes';
import { useAuth } from '../context/AuthContext';
import { T } from '../theme';

const ICONES = {
  mensagem: MessageCircle,
  tarefa: CheckSquare,
  reuniao: Video,
  arquivo: FileText,
  sistema: AlertCircle,
};

const CORES_ICONES = {
  mensagem: '#3B82F6',
  tarefa: '#F59E0B',
  reuniao: '#22C55E',
  arquivo: '#8B5CF6',
  sistema: '#6B7280',
};

export function CentroNotificacoes({ onCountChange }) {
  const { auth } = useAuth();
  const [notificacoes, setNotificacoes] = useState([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotificacoes(false);
      setNotificacoes(data);
      const { total } = await fetchContagemNotificacoes();
      if (onCountChange) onCountChange(total || 0);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => {
    carregar();
    const interval = setInterval(carregar, 30000);
    return () => clearInterval(interval);
  }, [carregar]);

  const marcarLida = async (id) => {
    await marcarNotificacaoLidaApi(id);
    setNotificacoes((prev) => prev.map((n) => n.id === id ? { ...n, lida: true } : n));
  };

  const marcarTodas = async () => {
    await marcarTodasNotificacoesLidas();
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    if (onCountChange) onCountChange(0);
  };

  const naoLidas = notificacoes.filter((n) => !n.lida);

  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg } },
    React.createElement('div', { style: { padding: '10px 16px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 } },
      React.createElement(Bell, { size: 20, color: T.primary }),
      React.createElement('span', { style: { fontWeight: 700, fontSize: 15, color: T.text } }, 'Notificações'),
      naoLidas.length > 0 && React.createElement('button', { onClick: marcarTodas, style: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: T.primary, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 } },
        React.createElement(CheckCheck, { size: 14 }), 'Marcar todas como lidas'),
    ),
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 12 } },
      notificacoes.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', color: T.textMuted, padding: 40 } }, 'Nenhuma notificação')
        : notificacoes.map((n) => {
            const Icon = ICONES[n.tipo] || Bell;
            const corIcon = CORES_ICONES[n.tipo] || '#6B7280';
            return React.createElement('div', {
              key: n.id, onClick: () => !n.lida && marcarLida(n.id),
              style: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: n.lida ? T.bg : T.surface, borderRadius: 8, marginBottom: 4, cursor: n.lida ? 'default' : 'pointer', opacity: n.lida ? 0.6 : 1, border: n.lida ? 'none' : `1px solid ${T.border}` },
            },
              React.createElement('div', { style: { width: 32, height: 32, borderRadius: '50%', background: `${corIcon}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                React.createElement(Icon, { size: 16, color: corIcon })),
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, n.titulo),
                n.mensagem && React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginTop: 2 } }, n.mensagem),
                React.createElement('div', { style: { fontSize: 10, color: T.textMuted, marginTop: 4 } }, new Date(n.criado_em).toLocaleString('pt-BR')),
              ),
              !n.lida && React.createElement('div', { style: { width: 8, height: 8, borderRadius: '50%', background: T.primary, flexShrink: 0, marginTop: 4 } }),
            );
          }),
    ),
  );
}
