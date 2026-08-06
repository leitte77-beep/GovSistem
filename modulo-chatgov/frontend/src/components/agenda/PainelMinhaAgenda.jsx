import React, { useState, useEffect, useCallback } from 'react';
import { Plus, CalendarDays, ChevronRight, Clock } from 'lucide-react';
import { T } from '../../theme';
import { fetchResumoAgenda, concluirItemAgenda, reabrirItemAgenda } from '../../api/agenda';
import { ItemAgenda } from './ItemAgenda';
import { ModalCompromisso } from './ModalCompromisso';
import { AgendaCompleta } from './AgendaCompleta';
import { notificarAgendaAtualizada, useAgendaAtualizada } from './eventos';
import { saudacao, primeiroNome } from './util';
import { useAuth } from '../../context/AuthContext';

const MAX_POR_BLOCO = 4;

export function PainelMinhaAgenda({ onAbrirConversa, breakpoint }) {
  const { auth } = useAuth();
  const nomeUsuario = auth?.operador?.nome || '';
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null);
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

  useAgendaAtualizada(() => carregar({ silencioso: true }));
  useEffect(() => {
    const onFoco = () => carregar({ silencioso: true });
    window.addEventListener('focus', onFoco);
    return () => window.removeEventListener('focus', onFoco);
  }, [carregar]);

  const concluir = async (item) => {
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

  const vazio = resumo
    && !resumo.hoje.length && !resumo.proximos.length && !resumo.pendencias.length;

  const totalHoje = (resumo?.hoje?.length || 0);
  const totalPendentes = (resumo?.pendencias?.length || 0);
  const atrasados = [...(resumo?.pendencias || []), ...(resumo?.hoje || [])].filter(
    (i) => i.status !== 'concluida' && i.status !== 'cancelada' && new Date(i.inicio).getTime() < Date.now()
  ).length;

  const blocoTitulo = (titulo, cor) =>
    React.createElement('span', { style: { fontWeight: 700, color: cor } }, titulo);

  const resumoNumeros = React.createElement('div', {
    style: {
      display: 'flex', gap: 16, fontSize: 12, color: T.textSecondary,
      padding: '0 0 12px', borderBottom: `1px solid ${T.border}`,
    },
  },
    React.createElement('span', null, blocoTitulo('Hoje ', T.text), totalHoje),
    React.createElement('span', null, blocoTitulo('Pendentes ', T.text), totalPendentes),
    React.createElement('span', null, blocoTitulo('Atrasados ', T.text), atrasados),
  );

  const itensComConteudo = !vazio && !carregando && !erro;

  const blocoLista = (titulo, itens, opcoes = {}) => {
    if (!itens?.length) return null;
    const visiveis = itens.slice(0, MAX_POR_BLOCO);
    const restantes = itens.length - visiveis.length;
    return React.createElement('div', { key: titulo, style: { marginBottom: 10 } },
      React.createElement('div', {
        style: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: opcoes.cor || T.textSecondary, marginBottom: 4 },
      }, titulo),
      ...visiveis.map((item) => React.createElement(ItemAgenda, {
        key: item.id,
        item,
        mostrarDia: opcoes.mostrarDia,
        onConcluir: concluir,
        onReabrir: reabrir,
        onEditar: setEditando,
        onAbrirConversa,
        compacto: true,
      })),
      restantes > 0 && React.createElement('button', {
        onClick: () => setVerTudo(true),
        style: { marginTop: 2, marginLeft: 13, background: 'none', border: 'none', padding: 0, fontSize: 12, color: T.primary, cursor: 'pointer', fontWeight: 600 },
      }, `+${restantes} ${restantes === 1 ? 'outro compromisso' : 'outros compromissos'}`),
    );
  };

  return React.createElement('div', {
    role: 'main',
    style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
  },
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
        paddingTop: '22vh',
        paddingLeft: ehMobile ? '18px' : '32px',
        paddingRight: ehMobile ? '18px' : '32px',
        paddingBottom: ehMobile ? '18px' : '32px',
        backgroundColor: T.bg,
        backgroundImage: `radial-gradient(${T.border} 0.45px, transparent 0.45px)`,
        backgroundSize: '24px 24px',
      },
    },
      nomeUsuario && React.createElement('div', {
        style: { width: '100%', maxWidth: 560, marginBottom: 20, textAlign: 'center' },
      },
        React.createElement('h2', {
          style: { fontSize: 20, fontWeight: 700, color: T.text, margin: 0 },
        }, `${saudacao()}, ${primeiroNome(nomeUsuario)}`),
        React.createElement('p', {
          style: { fontSize: 13.5, color: T.textSecondary, margin: '4px 0 0', lineHeight: '20px' },
        }, 'Organize seus retornos e compromissos sem sair do atendimento.'),
      ),

      React.createElement('div', {
        style: {
          width: '100%', maxWidth: 560, minHeight: 260,
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.radiusLg, boxShadow: T.shadow,
          padding: ehMobile ? 20 : 28,
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 } },
          React.createElement(CalendarDays, { size: 20, color: T.primary, style: { marginTop: 2, flexShrink: 0 } }),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('h2', { style: { fontSize: 16, fontWeight: 700, color: T.text, margin: 0 } }, 'Minha agenda'),
            React.createElement('p', { style: { fontSize: 12.5, color: T.textSecondary, margin: '2px 0 0', lineHeight: '18px' } },
              'Seus compromissos e lembretes de hoje'),
          ),
          React.createElement('button', {
            onClick: () => setCriando(true),
            style: {
              display: 'flex', alignItems: 'center', gap: 5, border: 'none', flexShrink: 0,
              background: T.primary, color: '#fff', padding: '8px 14px',
              borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 700,
            },
          }, React.createElement(Plus, { size: 15 }), '+ Novo compromisso'),
        ),

        carregando
          ? React.createElement('div', { style: { fontSize: 13, color: T.textSecondary, padding: '18px 0' } }, 'Carregando...')
          : erro
          ? React.createElement('div', { style: { fontSize: 13, color: T.danger, padding: '12px 0' } }, erro)
          : vazio
          ? React.createElement('div', { style: { padding: '4px 0' } },
              resumoNumeros,
              React.createElement('div', { style: { textAlign: 'center', padding: '24px 12px 16px' } },
                React.createElement(CalendarDays, { size: 36, color: T.textSecondary, style: { opacity: 0.3, margin: '0 auto' } }),
                React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: T.text, marginTop: 10 } },
                  'Nenhum compromisso para hoje'),
                React.createElement('div', { style: { fontSize: 12.5, color: T.textSecondary, marginTop: 4, lineHeight: '18px', maxWidth: 340, marginLeft: 'auto', marginRight: 'auto' } },
                  'Crie um lembrete, tarefa ou compromisso para organizar seus retornos.'),
              ),
            )
          : React.createElement(React.Fragment, null,
              resumoNumeros,
              blocoLista('Pendências', resumo.pendencias, { cor: T.danger, mostrarDia: true }),
              blocoLista('Hoje', resumo.hoje),
              blocoLista('Próximos', resumo.proximos, { mostrarDia: true }),
            ),

        !carregando && !erro && React.createElement('button', {
          onClick: () => setVerTudo(true),
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            marginTop: itensComConteudo ? 6 : 8, padding: 0,
            border: 'none', background: 'transparent', color: T.primary,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            width: '100%',
          },
        }, 'Ver agenda completa', React.createElement(ChevronRight, { size: 15 })),
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

function mapearItem(resumo, id, fn) {
  const mapear = (lista) => lista.map((i) => (i.id === id ? fn(i) : i));
  return {
    ...resumo,
    pendencias: mapear(resumo.pendencias),
    hoje: mapear(resumo.hoje),
    proximos: mapear(resumo.proximos),
  };
}
