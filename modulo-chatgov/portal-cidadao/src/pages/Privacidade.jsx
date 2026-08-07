import React, { useState, useEffect } from 'react';
import { T } from '../theme.js';
import { api, getToken } from '../api.js';
import { useLogado } from './LogadoContext.jsx';

export function Privacidade({ navigate }) {
  const { conta, logout } = useLogado();
  const [politica, setPolitica] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [exportando, setExportando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    fetch('/api/v1/public/privacy').then(r => r.json()).then(setPolitica).catch(() => {});
  }, []);

  const exportar = async () => {
    setExportando(true);
    try {
      const dados = await fetch('/api/v1/public/my/data/export', {
        headers: { Authorization: `Bearer ${getToken()}` },
      }).then(r => r.json());
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'meus-dados.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
    finally { setExportando(false); }
  };

  const excluir = async () => {
    if (!confirm('Tem certeza que deseja solicitar a exclusão dos seus dados? Esta ação não pode ser desfeita.')) return;
    setExcluindo(true);
    try {
      await fetch('/api/v1/public/my/data/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ motivo }),
      }).then(r => r.json());
      alert('Solicitação de exclusão registrada.');
      logout();
      navigate('');
    } catch (e) { alert(e.message); }
    finally { setExcluindo(false); }
  };

  return React.createElement('div', { style: { maxWidth: T.maxWidth, margin: '0 auto', padding: '20px' } },
    React.createElement('div', { style: { textAlign: 'center', marginBottom: 20 } },
      React.createElement('button', {
        onClick: () => navigate(''),
        style: { background: 'none', border: 'none', color: T.primary, fontSize: 14, cursor: 'pointer', fontWeight: 600, padding: '8px' },
      }, '← Voltar'),
      React.createElement('h1', { style: { fontSize: 22, fontWeight: 800, color: T.text, margin: '8px 0 4px' } }, 'Privacidade e LGPD'),
    ),

    React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 24, border: `1px solid ${T.border}`, marginBottom: 16 } },
      React.createElement('h2', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 12px' } }, 'Política de Privacidade'),
      politica ? React.createElement('div', { style: { fontSize: 13, color: T.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap' } }, politica.politica_privacidade)
        : React.createElement('div', { style: { color: T.textMuted, fontSize: 13 } }, 'Carregando...'),
    ),

    React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 24, border: `1px solid ${T.border}`, marginBottom: 16 } },
      React.createElement('h2', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 12px' } }, 'Seus Direitos (LGPD)'),
      politica && (politica.direitos_titular || []).map((d, i) =>
        React.createElement('div', { key: i, style: { fontSize: 13, color: T.textSecondary, padding: '3px 0' } }, `• ${d}`)
      ),
    ),

    politica?.encarregado && React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 24, border: `1px solid ${T.border}`, marginBottom: 16 } },
      React.createElement('h2', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 8px' } }, 'Encarregado de Proteção de Dados'),
      React.createElement('div', { style: { fontSize: 13, color: T.textSecondary, lineHeight: 1.5 } }, politica.encarregado),
    ),

    conta && React.createElement('div', { style: { background: T.surface, borderRadius: T.radius, padding: 24, border: `1px solid ${T.border}` } },
      React.createElement('h2', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 12px' } }, 'Ações da sua conta'),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        React.createElement('button', {
          onClick: exportar, disabled: exportando,
          style: { padding: '12px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
        }, exportando ? 'Exportando...' : 'Exportar meus dados'),
        React.createElement('button', {
          onClick: () => setShowDelete(!showDelete),
          style: { padding: '12px', borderRadius: T.radiusSm, border: `1.5px solid ${T.danger}`, background: 'transparent', color: T.danger, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
        }, 'Solicitar exclusão dos meus dados'),
        showDelete && React.createElement('div', { style: { padding: '12px', background: T.dangerSoft, borderRadius: T.radiusSm } },
          React.createElement('p', { style: { fontSize: 13, color: T.danger, margin: '0 0 8px' } }, 'Esta ação irá desativar sua conta e solicitar a remoção dos seus dados pessoais.'),
          React.createElement('textarea', {
            value: motivo, onChange: e => setMotivo(e.target.value),
            placeholder: 'Motivo da solicitação (opcional)',
            rows: 2,
            style: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, fontSize: 13, fontFamily: T.font, marginBottom: 8, resize: 'vertical' },
          }),
          React.createElement('button', {
            onClick: excluir, disabled: excluindo,
            style: { padding: '10px 20px', borderRadius: T.radiusSm, border: 'none', background: T.danger, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
          }, excluindo ? 'Processando...' : 'Confirmar exclusão'),
        ),
      ),
    ),
  );
}
