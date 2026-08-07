import React, { useState, useEffect } from 'react';
import { T } from '../theme.js';
import { BarChart3, TrendingUp, Clock, Users, FileText, AlertCircle, Loader2, Download } from 'lucide-react';

function token() {
  try { return JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token; } catch { return ''; }
}

export function PaginaRelatoriosProtocolos({ breakpoint }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const ehMobile = breakpoint === 'mobile';

  useEffect(() => {
    fetch('/api/v1/protocols/dashboard', { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setDashboard(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return React.createElement('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    React.createElement(Loader2, { size: 28, className: 'spin', style: { color: T.textMuted } })
  );

  const totals = dashboard?.totais || {};
  const porStatus = dashboard?.porStatus || [];
  const porOrigem = dashboard?.porOrigem || [];
  const porSetor = dashboard?.porSetor || [];
  const atrasados = dashboard?.atrasados || [];

  const card = (Icone, label, valor, cor) => React.createElement('div', {
    style: { background: T.surface, borderRadius: T.radius, padding: '16px', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 },
  },
    React.createElement('div', { style: { width: 40, height: 40, borderRadius: T.radiusSm, background: `${cor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      React.createElement(Icone, { size: 20, style: { color: cor } })),
    React.createElement('div', null,
      React.createElement('div', { style: { fontSize: 22, fontWeight: 800, color: T.text } }, valor),
      React.createElement('div', { style: { fontSize: 11.5, color: T.textMuted, fontWeight: 600 } }, label),
    ),
  );

  const barra = (label, valor, maxValor, cor) => {
    const pct = maxValor > 0 ? Math.round((valor / maxValor) * 100) : 0;
    return React.createElement('div', { key: label, style: { marginBottom: 8 } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.textSecondary, marginBottom: 3 } },
        React.createElement('span', null, label || 'Não definido'),
        React.createElement('span', { style: { fontWeight: 700, color: T.text } }, valor),
      ),
      React.createElement('div', { style: { height: 6, background: T.surfaceMuted, borderRadius: 3, overflow: 'hidden' } },
        React.createElement('div', { style: { height: '100%', width: `${pct}%`, background: cor || T.primary, borderRadius: 3, transition: 'width 0.3s' } }),
      ),
    );
  };

  const maxStatus = Math.max(...porStatus.map(s => s.total), 1);
  const maxOrigem = Math.max(...porOrigem.map(s => s.total), 1);

  return React.createElement('div', {
    style: { flex: 1, height: '100%', overflowY: 'auto', background: T.bg, padding: 20 },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 } },
      React.createElement(BarChart3, { size: 22, style: { color: T.primary } }),
      React.createElement('h2', { style: { fontSize: 20, fontWeight: 700, color: T.text, margin: 0 } }, 'Relatórios de Protocolos'),
    ),

    // Cards resumo
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: `repeat(${Math.min(ehMobile ? 2 : 4, 4)}, 1fr)`, gap: 10, marginBottom: 20 },
    },
      card(FileText, 'Total', totals.total || 0, T.primary),
      card(Clock, 'Abertos', totals.abertos || 0, T.warning),
      card(AlertCircle, 'Atrasados', totals.atrasados || 0, T.danger),
      card(TrendingUp, 'Concluídos', totals.concluidos || 0, T.success),
    ),

    // Gráficos
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: ehMobile ? '1fr' : '1fr 1fr', gap: 16 },
    },
      // Por status
      React.createElement('div', {
        style: { background: T.surface, borderRadius: T.radius, padding: '16px 20px', border: `1px solid ${T.border}` },
      },
        React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 } }, 'Por Status'),
        porStatus.length === 0
          ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted, textAlign: 'center', padding: 20 } }, 'Sem dados')
          : porStatus.map(s => barra(
              { ABERTO: 'Aberto', EM_ANDAMENTO: 'Em andamento', PENDENTE: 'Pendente', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado' }[s.status] || s.status,
              s.total, maxStatus,
              { ABERTO: T.warning, EM_ANDAMENTO: T.primary, PENDENTE: '#F59E0B', CONCLUIDO: T.success, CANCELADO: T.danger }[s.status] || T.primary
            )),
      ),

      // Por origem
      React.createElement('div', {
        style: { background: T.surface, borderRadius: T.radius, padding: '16px 20px', border: `1px solid ${T.border}` },
      },
        React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 } }, 'Por Origem'),
        porOrigem.length === 0
          ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted, textAlign: 'center', padding: 20 } }, 'Sem dados')
          : porOrigem.map(s => {
              const mapa = { whatsapp: 'WhatsApp', portal: 'Portal', presencial: 'Presencial', telefone: 'Telefone', email: 'E-mail', interno: 'Interno' };
              return barra(mapa[s.origem] || s.origem, s.total, maxOrigem, T.primary);
            }),
      ),
    ),

    // Atrasados
    atrasados.length > 0 && React.createElement('div', {
      style: { background: T.surface, borderRadius: T.radius, padding: '16px 20px', border: `1px solid ${T.border}`, marginTop: 16 },
    },
      React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: T.danger, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 } },
        React.createElement(AlertCircle, { size: 16 }), 'Protocolos Atrasados'),
      atrasados.map(p => React.createElement('div', {
        key: p.id,
        style: { display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: T.radiusSm, background: T.dangerSoft, marginBottom: 4, fontSize: 12.5 },
      },
        React.createElement('span', { style: { fontFamily: 'monospace', fontWeight: 700, color: T.text, marginRight: 8 } }, p.numero),
        React.createElement('span', { style: { flex: 1, color: T.textSecondary } }, p.assunto || '—'),
        p.setor_atual_nome && React.createElement('span', { style: { color: T.textMuted, fontSize: 11, marginLeft: 8 } }, p.setor_atual_nome),
      )),
    ),
  );
}
