import React, { useState, useEffect } from 'react';
import { T } from '../theme.js';
import { api, getToken } from '../api.js';

const STATUS_LABELS = {
  ABERTO: 'Recebida', EM_ANDAMENTO: 'Em análise', PENDENTE: 'Aguardando você',
  CONCLUIDO: 'Concluída', CANCELADO: 'Cancelada',
};
const STATUS_COR = {
  ABERTO: T.warning, EM_ANDAMENTO: T.primary, PENDENTE: '#F59E0B',
  CONCLUIDO: T.success, CANCELADO: T.danger,
};

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function MeusProtocolos({ navigate }) {
  const [protocolos, setProtocolos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!getToken()) { navigate(''); return; }
    api.meusProtocolos()
      .then(p => { setProtocolos(Array.isArray(p) ? p : []); })
      .catch(e => { setErro(e.message); if (e.message.includes('login')) navigate(''); })
      .finally(() => setLoading(false));
  }, []);

  return React.createElement('div', {
    style: { maxWidth: T.maxWidth, margin: '0 auto', padding: '20px' },
  },
    React.createElement('div', { style: { textAlign: 'center', marginBottom: 20 } },
      React.createElement('button', {
        onClick: () => navigate(''),
        style: { background: 'none', border: 'none', color: T.primary, fontSize: 14, cursor: 'pointer', fontWeight: 600, padding: '8px' },
      }, '← Início'),
      React.createElement('h1', { style: { fontSize: 22, fontWeight: 800, color: T.text, margin: '8px 0 4px' } }, 'Meus protocolos'),
    ),

    loading
      ? React.createElement('div', { style: { textAlign: 'center', padding: 40, color: T.textMuted } }, 'Carregando...')
      : erro
      ? React.createElement('div', { style: { textAlign: 'center', padding: 40, color: T.danger } }, erro)
      : protocolos.length === 0
      ? React.createElement('div', { style: { textAlign: 'center', padding: 40, background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}` } },
          React.createElement('p', { style: { color: T.textSecondary, fontSize: 14 } }, 'Você ainda não possui protocolos.'),
          React.createElement('button', {
            onClick: () => navigate('nova-solicitacao'),
            style: { padding: '12px 24px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12 },
          }, 'Fazer uma solicitação'),
        )
      : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          protocolos.map(p => React.createElement('div', {
            key: p.id,
            onClick: () => { /* TODO: set token and navigate */ },
            style: { padding: '14px', borderRadius: T.radius, background: T.surface, border: `1px solid ${T.border}`, cursor: 'pointer', boxShadow: T.shadowMd },
          },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 } },
              React.createElement('span', { style: { fontSize: 14, fontWeight: 700, color: T.text, fontFamily: 'monospace' } }, p.numero),
              React.createElement('span', {
                style: { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: STATUS_COR[p.status_operacional] || T.textMuted, background: `${STATUS_COR[p.status_operacional] || T.textMuted}20` },
              }, STATUS_LABELS[p.status_operacional] || p.status_operacional),
            ),
            React.createElement('div', { style: { fontSize: 13, color: T.text, fontWeight: 600, marginBottom: 2 } }, p.assunto || 'Sem assunto'),
            React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted } },
              formatarData(p.aberto_em),
              p.setor_atual_nome ? ` · ${p.setor_atual_nome}` : '',
              p.pendencias_abertas > 0 ? ` · ${p.pendencias_abertas} pendência(s)` : '',
            ),
          )),
        ),
  );
}
