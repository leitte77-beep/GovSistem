import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Search, CalendarDays } from 'lucide-react';
import { T } from '../../theme';
import { fetchItensAgenda, concluirItemAgenda, reabrirItemAgenda, janelaDeHoje } from '../../api/agenda';
import { ItemAgenda } from './ItemAgenda';
import { ModalCompromisso } from './ModalCompromisso';
import { notificarAgendaAtualizada } from './eventos';

// A visão em lista é a que o servidor realmente usa no dia a dia. Dia/semana/mês
// em grade de calendário fica para a etapa da agenda compartilhada, onde a grade
// passa a valer a pena (vários calendários sobrepostos).
const ABAS = [
  { key: 'hoje',       label: 'Hoje' },
  { key: 'amanha',     label: 'Amanhã' },
  { key: 'semana',     label: 'Esta semana' },
  { key: 'atrasados',  label: 'Atrasados' },
  { key: 'concluidos', label: 'Concluídos' },
];

/** Traduz a aba escolhida nos filtros que a API entende. */
function filtrosDaAba(aba) {
  const { inicio, fim } = janelaDeHoje();
  const maisDias = (d, n) => new Date(d.getTime() + n * 86400000).toISOString();

  switch (aba) {
    case 'hoje':
      return { inicio: inicio.toISOString(), fim: fim.toISOString(), status: 'abertos' };
    case 'amanha':
      return { inicio: fim.toISOString(), fim: maisDias(fim, 1), status: 'abertos' };
    case 'semana':
      return { inicio: inicio.toISOString(), fim: maisDias(fim, 6), status: 'abertos' };
    case 'atrasados':
      // Tudo que já venceu e continua em aberto — inclusive o que venceu hoje
      // mais cedo, que é o caso mais comum de esquecimento.
      return { fim: new Date().toISOString(), status: 'abertos' };
    case 'concluidos':
      return { status: 'concluida', ordem: 'desc' };
    default:
      return { status: 'abertos' };
  }
}

export function AgendaCompleta({ onClose, onAbrirConversa, breakpoint }) {
  const [aba, setAba] = useState('hoje');
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const ehMobile = breakpoint === 'mobile';

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setItens(await fetchItensAgenda({ ...filtrosDaAba(aba), q: busca.trim() || undefined, limite: 100 }));
      setErro('');
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar a agenda.');
    } finally {
      setCarregando(false);
    }
  }, [aba, busca]);

  // A busca dispara a cada tecla; o atraso evita uma consulta por caractere.
  useEffect(() => {
    const t = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape' && !criando && !editando) onClose?.(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, criando, editando]);

  const concluir = async (item) => {
    setItens((l) => l.map((i) => (i.id === item.id ? { ...i, status: 'concluida' } : i)));
    try { await concluirItemAgenda(item.id); notificarAgendaAtualizada(); } catch { carregar(); }
  };
  const reabrir = async (item) => {
    setItens((l) => l.map((i) => (i.id === item.id ? { ...i, status: 'pendente' } : i)));
    try { await reabrirItemAgenda(item.id); notificarAgendaAtualizada(); } catch { carregar(); }
  };
  const aposSalvar = () => { carregar(); notificarAgendaAtualizada(); };

  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: ehMobile ? 0 : 24,
    },
    onMouseDown: (e) => { if (e.target === e.currentTarget) onClose?.(); },
  },
    React.createElement('div', {
      role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Agenda completa',
      style: {
        background: T.surface, borderRadius: ehMobile ? 0 : T.radiusLg,
        width: '100%', maxWidth: 680, height: ehMobile ? '100%' : '82vh',
        display: 'flex', flexDirection: 'column', boxShadow: T.shadowLg, overflow: 'hidden',
      },
    },
      /* cabeçalho */
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px', borderBottom: `1px solid ${T.border}` } },
        React.createElement(CalendarDays, { size: 19, color: T.primary }),
        React.createElement('h2', { style: { fontSize: 17, fontWeight: 700, color: T.text, flex: 1 } }, 'Minha agenda'),
        React.createElement('button', {
          onClick: () => setCriando(true),
          style: { display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: T.primary, color: '#fff', padding: '7px 13px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12.5, fontWeight: 700 },
        }, React.createElement(Plus, { size: 15 }), 'Novo'),
        React.createElement('button', {
          onClick: onClose, 'aria-label': 'Fechar agenda',
          style: { width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: T.radiusSm, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, React.createElement(X, { size: 18, color: T.textMuted })),
      ),

      /* abas */
      React.createElement('nav', {
        style: { display: 'flex', gap: 18, padding: '0 20px', borderBottom: `1px solid ${T.border}`, overflowX: 'auto', flexShrink: 0 },
      },
        ...ABAS.map((a) => React.createElement('button', {
          key: a.key,
          onClick: () => setAba(a.key),
          style: {
            background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0',
            fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
            fontWeight: aba === a.key ? 700 : 500,
            color: aba === a.key ? T.primary : T.textMuted,
            borderBottom: `2px solid ${aba === a.key ? T.primary : 'transparent'}`,
          },
        }, a.label)),
      ),

      /* busca */
      React.createElement('div', { style: { padding: '12px 20px 8px', position: 'relative', flexShrink: 0 } },
        React.createElement(Search, { size: 16, color: T.textMuted, style: { position: 'absolute', left: 32, top: '50%', transform: 'translateY(-40%)' } }),
        React.createElement('input', {
          value: busca, onChange: (e) => setBusca(e.target.value),
          placeholder: 'Buscar por título ou descrição...',
          style: { width: '100%', height: 38, padding: '0 12px 0 36px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, fontSize: 13, color: T.text, background: T.surface, outline: 'none', boxSizing: 'border-box' },
        }),
      ),

      /* lista */
      React.createElement('div', { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px 20px' } },
        carregando
          ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted, padding: '20px 0' } }, 'Carregando...')
          : erro
          ? React.createElement('div', { style: { fontSize: 13, color: T.danger, padding: '20px 0' } }, erro)
          : itens.length === 0
          ? React.createElement('div', { style: { textAlign: 'center', padding: '48px 12px', color: T.textMuted } },
              React.createElement(CalendarDays, { size: 40, style: { opacity: 0.25 } }),
              React.createElement('div', { style: { fontSize: 13.5, fontWeight: 600, marginTop: 10 } },
                busca ? 'Nenhum item encontrado.' : 'Nada nesta lista.'),
            )
          : React.createElement('div', null,
              ...itens.map((item) => React.createElement(ItemAgenda, {
                key: item.id,
                item,
                mostrarDia: aba !== 'hoje',
                onConcluir: concluir,
                onReabrir: reabrir,
                onEditar: setEditando,
                onAbrirConversa: onAbrirConversa && ((id) => { onAbrirConversa(id); onClose?.(); }),
              })),
            ),
      ),
    ),

    (criando || editando) && React.createElement(ModalCompromisso, {
      item: editando,
      onClose: () => { setCriando(false); setEditando(null); },
      onSalvo: aposSalvar,
      onExcluido: aposSalvar,
    }),
  );
}
