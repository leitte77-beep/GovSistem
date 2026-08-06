import React from 'react';
import { Check, MessageCircle, Bell, RotateCcw } from 'lucide-react';
import { T } from '../../theme';
import { PRIORIDADES, horarioDoItem, rotuloDia, estaAtrasado } from './util';

/**
 * Linha de um item da agenda.
 *
 * A prioridade entra como faixa lateral de 3px, não como fundo do card: numa
 * lista de dez itens, cor de fundo vira ruído e o atendente para de enxergar o
 * que é urgente de verdade.
 */
export function ItemAgenda({ item, mostrarDia = false, onConcluir, onReabrir, onEditar, onAbrirConversa, compacto = false }) {
  const prio = PRIORIDADES[item.prioridade] || PRIORIDADES.normal;
  const atrasado = estaAtrasado(item);
  const concluido = item.status === 'concluida';
  const temLembrete = (item.lembretes?.length || 0) > 0;

  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: compacto ? '7px 10px 7px 0' : '9px 12px 9px 0',
      borderLeft: `3px solid ${item.prioridade === 'normal' && !atrasado ? 'transparent' : prio.cor}`,
      paddingLeft: 10,
      borderRadius: T.radiusSm,
      background: 'transparent',
      opacity: concluido ? 0.55 : 1,
    },
  },
    /* concluir / reabrir */
    React.createElement('button', {
      onClick: () => (concluido ? onReabrir?.(item) : onConcluir?.(item)),
      title: concluido ? 'Reabrir' : 'Marcar como concluído',
      'aria-label': concluido ? `Reabrir ${item.titulo}` : `Concluir ${item.titulo}`,
      style: {
        width: 20, height: 20, marginTop: 2, flexShrink: 0, cursor: 'pointer',
        borderRadius: concluido ? T.radiusSm : '50%',
        border: `1.5px solid ${concluido ? T.success : T.borderStrong}`,
        background: concluido ? T.success : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      },
    }, concluido
      ? React.createElement(Check, { size: 13, color: '#fff' })
      : null),

    /* conteúdo */
    React.createElement('div', {
      style: { flex: 1, minWidth: 0, cursor: onEditar ? 'pointer' : 'default' },
      onClick: () => onEditar?.(item),
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
        React.createElement('span', {
          style: {
            fontSize: 12, fontWeight: 700, flexShrink: 0,
            color: atrasado ? T.danger : T.textSecondary,
            fontVariantNumeric: 'tabular-nums',
          },
        }, mostrarDia ? `${rotuloDia(item.inicio)} ${item.dia_todo ? '' : horarioDoItem(item)}`.trim() : horarioDoItem(item)),
        React.createElement('span', {
          style: {
            fontSize: 13.5, color: T.text, fontWeight: 500,
            textDecoration: concluido ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          },
        }, item.titulo),
      ),

      /* etiquetas: só aparecem quando dizem algo */
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' } },
        (item.prioridade === 'alta' || item.prioridade === 'urgente') && !concluido && React.createElement('span', {
          style: { fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: prio.cor, background: prio.fundo, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' },
        }, prio.label),
        atrasado && !concluido && React.createElement('span', {
          style: { fontSize: 10, fontWeight: 700, color: T.danger },
        }, 'Atrasado'),
        item.categoria && React.createElement('span', {
          style: { fontSize: 10.5, color: T.textMuted },
        }, item.categoria),
        temLembrete && React.createElement(Bell, { size: 10, color: T.textMuted }),
      ),
    ),

    /* atalho para a conversa vinculada */
    item.conversa_id && onAbrirConversa && React.createElement('button', {
      onClick: (e) => { e.stopPropagation(); onAbrirConversa(item.conversa_id); },
      title: 'Abrir conversa vinculada',
      'aria-label': 'Abrir conversa vinculada',
      style: {
        width: 26, height: 26, flexShrink: 0, border: 'none', background: 'transparent',
        cursor: 'pointer', borderRadius: T.radiusSm, display: 'flex', alignItems: 'center', justifyContent: 'center',
      },
    }, React.createElement(MessageCircle, { size: 14, color: T.primary })),

    concluido && onReabrir && React.createElement(RotateCcw, { size: 12, color: T.textMuted, style: { marginTop: 5, flexShrink: 0 } }),
  );
}
