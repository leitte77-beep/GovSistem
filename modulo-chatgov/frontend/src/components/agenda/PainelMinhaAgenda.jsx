import React, { useState, useEffect, useCallback } from 'react';
import { Plus, CalendarDays, ChevronRight } from 'lucide-react';
import { T } from '../../theme';
import { fetchResumoAgenda, concluirItemAgenda, reabrirItemAgenda } from '../../api/agenda';
import { ItemAgenda } from './ItemAgenda';
import { ModalCompromisso } from './ModalCompromisso';
import { AgendaCompleta } from './AgendaCompleta';
import { notificarAgendaAtualizada, useAgendaAtualizada } from './eventos';

// Teto do que a tela inicial mostra por bloco. O resto fica na agenda completa:
// a área vazia é um cartão de apoio, não um dashboard.
const MAX_POR_BLOCO = 5;

/**
 * Painel exibido na área central quando nenhuma conversa está aberta.
 * Substitui o antigo estado vazio ("Selecione uma conversa").
 */
export function PainelMinhaAgenda({ onAbrirConversa, breakpoint }) {
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);   // item em edição
  const [criando, setCriando] = useState(false);
  const [verTudo, setVerTudo] = useState(false);
  const ehMobile = breakpoint === 'mobile';

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true);
    try {
      setResumo(await fetchResumoAgenda({ dias: 7 }));
      setErro('');
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar a agenda.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Recarrega sem piscar quando algo mexe na agenda em outro ponto da tela
  // (popup de lembrete, modal de login) e quando a aba volta ao foco — o
  // atendente costuma deixar o ChatGov aberto o dia inteiro.
  useAgendaAtualizada(() => carregar({ silencioso: true }));
  useEffect(() => {
    const onFoco = () => carregar({ silencioso: true });
    window.addEventListener('focus', onFoco);
    return () => window.removeEventListener('focus', onFoco);
  }, [carregar]);

  const concluir = async (item) => {
    // Otimista: a lista responde na hora e o servidor confirma depois. Se
    // falhar, o recarregamento devolve o item ao estado real.
    setResumo((r) => r && mapearItem(r, item.id, (i) => ({ ...i, status: 'concluida' })));
    try {
      await concluirItemAgenda(item.id);
      notificarAgendaAtualizada();
    } catch {
      carregar({ silencioso: true });
    }
  };

  const reabrir = async (item) => {
    setResumo((r) => r && mapearItem(r, item.id, (i) => ({ ...i, status: 'pendente' })));
    try {
      await reabrirItemAgenda(item.id);
      notificarAgendaAtualizada();
    } catch {
      carregar({ silencioso: true });
    }
  };

  const aposSalvar = () => { carregar({ silencioso: true }); notificarAgendaAtualizada(); };

  const bloco = (titulo, itens, opcoes = {}) => {
    if (!itens?.length) return null;
    const visiveis = itens.slice(0, MAX_POR_BLOCO);
    const restantes = itens.length - visiveis.length;
    return React.createElement('div', { key: titulo, style: { marginBottom: 18 } },
      React.createElement('div', {
        style: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: opcoes.cor || T.textMuted, marginBottom: 6 },
      }, titulo),
      ...visiveis.map((item) => React.createElement(ItemAgenda, {
        key: item.id,
        item,
        mostrarDia: opcoes.mostrarDia,
        onConcluir: concluir,
        onReabrir: reabrir,
        onEditar: setEditando,
        onAbrirConversa,
      })),
      restantes > 0 && React.createElement('button', {
        onClick: () => setVerTudo(true),
        style: { marginTop: 2, marginLeft: 13, background: 'none', border: 'none', padding: 0, fontSize: 12, color: T.primary, cursor: 'pointer', fontWeight: 600 },
      }, `+${restantes} ${restantes === 1 ? 'item' : 'itens'}`),
    );
  };

  const vazio = resumo
    && !resumo.hoje.length && !resumo.proximos.length && !resumo.pendencias.length;

  return React.createElement('div', {
    role: 'main',
    style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
  },
    /* cabeçalho da área central, o mesmo do estado vazio anterior */
    React.createElement('header', {
      style: {
        height: 64, width: '100%', display: 'flex', alignItems: 'center', padding: '0 24px',
        background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      },
    },
      React.createElement('h1', { style: { fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: -0.3 } },
        'ChatGov — Central de Atendimento'),
    ),

    React.createElement('div', {
      style: {
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: vazio ? 'center' : 'flex-start',
        padding: ehMobile ? '18px 14px' : '32px 24px',
        backgroundColor: T.bg,
        backgroundImage: `radial-gradient(${T.borderStrong} 0.45px, transparent 0.45px)`,
        backgroundSize: '24px 24px',
      },
    },
      React.createElement('div', {
        style: {
          width: '100%', maxWidth: 520,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.radiusLg, boxShadow: T.shadow,
          padding: ehMobile ? 16 : 22,
        },
      },
        /* título do cartão */
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 } },
          React.createElement(CalendarDays, { size: 19, color: T.primary }),
          React.createElement('h2', { style: { fontSize: 16, fontWeight: 700, color: T.text, flex: 1 } }, 'Minha agenda'),
          React.createElement('button', {
            onClick: () => setCriando(true),
            style: {
              display: 'flex', alignItems: 'center', gap: 5, border: 'none',
              background: T.primary, color: '#fff', padding: '7px 13px',
              borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            },
          }, React.createElement(Plus, { size: 15 }), 'Novo'),
        ),

        carregando
          ? React.createElement('div', { style: { fontSize: 13, color: T.textMuted, padding: '18px 0' } }, 'Carregando...')
          : erro
          ? React.createElement('div', { style: { fontSize: 13, color: T.danger, padding: '12px 0' } }, erro)
          : vazio
          ? React.createElement('div', { style: { padding: '10px 0 4px' } },
              React.createElement('div', { style: { fontSize: 14, color: T.textSecondary, fontWeight: 600 } }, 'Nada marcado por aqui.'),
              React.createElement('div', { style: { fontSize: 12.5, color: T.textMuted, marginTop: 4, lineHeight: '18px' } },
                'Selecione uma conversa na lista ao lado para atender, ou registre um compromisso para não esquecer de um retorno.'),
            )
          : React.createElement(React.Fragment, null,
              bloco('Pendências', resumo.pendencias, { cor: T.danger, mostrarDia: true }),
              bloco('Hoje', resumo.hoje),
              bloco('Próximos', resumo.proximos, { mostrarDia: true }),
            ),

        !carregando && !erro && React.createElement('button', {
          onClick: () => setVerTudo(true),
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            width: '100%', marginTop: 8, padding: '9px 0',
            border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
            background: 'transparent', color: T.textSecondary,
            cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          },
        }, 'Abrir agenda completa', React.createElement(ChevronRight, { size: 15 })),
      ),
    ),

    (criando || editando) && React.createElement(ModalCompromisso, {
      item: editando,
      onClose: () => { setCriando(false); setEditando(null); },
      onSalvo: aposSalvar,
      onExcluido: aposSalvar,
    }),

    verTudo && React.createElement(AgendaCompleta, {
      onClose: () => setVerTudo(false),
      onAbrirConversa,
      breakpoint,
    }),
  );
}

/** Aplica uma transformação ao item de id `id` nas três listas do resumo. */
function mapearItem(resumo, id, fn) {
  const mapear = (lista) => lista.map((i) => (i.id === id ? fn(i) : i));
  return {
    ...resumo,
    pendencias: mapear(resumo.pendencias),
    hoje: mapear(resumo.hoje),
    proximos: mapear(resumo.proximos),
  };
}
