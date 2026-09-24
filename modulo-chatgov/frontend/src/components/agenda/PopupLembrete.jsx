import React, { useState } from 'react';
import { Bell, X, Check, Clock, MessageCircle } from 'lucide-react';
import { T } from '../../theme';
import { PRIORIDADES, OPCOES_ADIAR, horarioDoItem, rotuloDia, tempoAte } from './util';

/**
 * Aviso de lembrete vencido.
 *
 * Canto inferior direito, sem backdrop: o atendente pode estar no meio de uma
 * resposta ao cidadão, e um modal que trava a tela para dizer "faltam 30
 * minutos" atrapalha mais do que ajuda.
 */
export function PopupLembrete({ lembrete, restantes = 0, ocupado, onDispensar, onAdiar, onConcluir, onAbrirConversa, breakpoint }) {
  const [mostrarAdiar, setMostrarAdiar] = useState(false);
  const ehMobile = breakpoint === 'mobile';
  const prio = PRIORIDADES[lembrete.prioridade] || PRIORIDADES.normal;

  const quando = `${rotuloDia(lembrete.inicio)} às ${horarioDoItem(lembrete)}`;

  return React.createElement('div', {
    role: 'alertdialog',
    'aria-label': `Lembrete: ${lembrete.titulo}`,
    style: {
      position: 'fixed',
      right: ehMobile ? 12 : 20,
      left: ehMobile ? 12 : 'auto',
      // No celular a barra de navegação inferior ocupa a base da tela.
      bottom: ehMobile ? 'calc(84px + env(safe-area-inset-bottom, 0px))' : 20,
      width: ehMobile ? 'auto' : 340,
      background: T.surface,
      borderRadius: T.radius,
      border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${prio.cor}`,
      boxShadow: T.shadowLg,
      zIndex: 1100,
      overflow: 'hidden',
    },
  },
    React.createElement('div', { style: { padding: '13px 14px 12px' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 } },
        React.createElement(Bell, { size: 15, color: prio.cor }),
        React.createElement('span', { style: { fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: prio.cor, flex: 1 } }, 'Lembrete'),
        restantes > 0 && React.createElement('span', {
          style: { fontSize: 10.5, fontWeight: 700, color: T.textMuted, background: T.surfaceMuted, padding: '2px 7px', borderRadius: 9999 },
        }, `+${restantes} na fila`),
        React.createElement('button', {
          onClick: () => onDispensar(lembrete), 'aria-label': 'Dispensar lembrete',
          style: { width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
        }, React.createElement(X, { size: 15, color: T.textMuted })),
      ),

      React.createElement('div', { style: { fontSize: 14.5, fontWeight: 700, color: T.text, lineHeight: '19px' } }, lembrete.titulo),
      React.createElement('div', { style: { fontSize: 12, color: T.textSecondary, marginTop: 3 } }, quando),
      React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginTop: 1 } }, tempoAte(lembrete.inicio)),

      (lembrete.protocolo_numero || lembrete.contato_nome) && React.createElement('div', {
        style: { fontSize: 11.5, color: T.textMuted, marginTop: 6 },
      }, 'Vinculado a ', React.createElement('strong', { style: { color: T.textSecondary } },
        lembrete.protocolo_numero || lembrete.contato_nome)),
    ),

    /* ações */
    mostrarAdiar
      ? React.createElement('div', { style: { display: 'flex', gap: 5, flexWrap: 'wrap', padding: '0 14px 13px' } },
          ...OPCOES_ADIAR.map((o) => React.createElement('button', {
            key: o.min,
            onClick: () => onAdiar(lembrete, o.min),
            disabled: ocupado,
            style: { padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 9999, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary },
          }, o.label)),
          React.createElement('button', {
            onClick: () => setMostrarAdiar(false),
            style: { padding: '6px 11px', fontSize: 12, cursor: 'pointer', borderRadius: 9999, border: 'none', background: 'transparent', color: T.textMuted },
          }, 'Voltar'),
        )
      : React.createElement('div', { style: { display: 'flex', gap: 6, padding: '0 14px 13px', flexWrap: 'wrap' } },
          React.createElement('button', {
            onClick: () => onConcluir(lembrete), disabled: ocupado,
            style: { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', borderRadius: T.radiusSm, border: 'none', background: T.success, color: '#fff' },
          }, React.createElement(Check, { size: 14 }), 'Concluir'),
          React.createElement('button', {
            onClick: () => setMostrarAdiar(true), disabled: ocupado,
            style: { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary },
          }, React.createElement(Clock, { size: 14 }), 'Adiar'),
          lembrete.conversa_id && onAbrirConversa && React.createElement('button', {
            onClick: () => { onAbrirConversa(lembrete.conversa_id); onDispensar(lembrete); },
            style: { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.surface, color: T.primary },
          }, React.createElement(MessageCircle, { size: 14 }), 'Conversa'),
        ),
  );
}
