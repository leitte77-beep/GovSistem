import React, { useState } from 'react';
import { T } from '../theme';

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalCard = { background: T.surface, borderRadius: T.radiusLg, padding: 24, maxWidth: 440, width: '90%', boxShadow: T.shadowLg };
const modalTitulo = { fontSize: 18, fontWeight: 700, marginBottom: 14, color: T.text };
const linhaSelecao = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', color: T.text, fontSize: 14, cursor: 'pointer' };
const btnSecundario = { background: 'transparent', border: `1px solid ${T.borderStrong}`, color: T.textSecondary, padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 500 };
const btnPrimario = { background: T.primary, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

export function ModalSelecaoOperadores({ titulo, operadores, selecaoUnica, onClose, onConfirmar }) {
  const [sel, setSel] = useState([]);
  const [busca, setBusca] = useState('');
  const toggle = (id) => {
    if (selecaoUnica) { onConfirmar([id]); return; }
    setSel((p) => p.includes(id) ? p.filter((i) => i !== id) : [...p, id]);
  };
  const filtrados = operadores.filter((o) => !busca || o.nome.toLowerCase().includes(busca.toLowerCase()));
  return React.createElement('div', { style: overlay, onClick: onClose, role: 'dialog', 'aria-label': titulo },
    React.createElement('div', { onClick: (e) => e.stopPropagation(), style: modalCard },
      React.createElement('h3', { style: modalTitulo }, titulo),
      operadores.length > 6 && React.createElement('input', {
        type: 'search', value: busca, onChange: (e) => setBusca(e.target.value), placeholder: 'Buscar...',
        'aria-label': 'Buscar operador',
        style: { width: '100%', padding: '8px 10px', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' },
      }),
      React.createElement('div', { style: { maxHeight: 280, overflowY: 'auto', margin: '8px 0' } },
        filtrados.length === 0
          ? React.createElement('p', { style: { fontSize: 13, color: T.textMuted, padding: 12, textAlign: 'center' } }, 'Nenhum operador encontrado')
          : filtrados.map((o) =>
              React.createElement('button', {
                key: o.id, onClick: () => toggle(o.id),
                'aria-pressed': sel.includes(o.id),
                style: {
                  ...linhaSelecao, width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: sel.includes(o.id) ? T.primarySoft : 'transparent', borderRadius: T.radiusSm,
                },
              },
                React.createElement('span', { style: { width: 8, height: 8, borderRadius: '50%', background: o.online ? T.online : T.offline } }),
                o.nome,
              ))),
      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement('button', { onClick: onClose, style: btnSecundario }, 'Cancelar'),
        !selecaoUnica && React.createElement('button', { onClick: () => onConfirmar(sel), disabled: sel.length === 0, style: { ...btnPrimario, opacity: sel.length === 0 ? 0.5 : 1, cursor: sel.length === 0 ? 'not-allowed' : 'pointer' } }, 'Confirmar'),
      ),
    ),
  );
}
