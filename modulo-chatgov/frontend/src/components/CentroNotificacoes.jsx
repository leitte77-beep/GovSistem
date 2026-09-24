import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, CheckCheck, MessageCircle, CheckSquare, Video, FileText, AlertCircle,
  Archive, ArchiveRestore, Search, ArrowLeftRight, UserCheck, Clock, WifiOff, Loader2,
} from 'lucide-react';
import {
  fetchNotificacoes, fetchContagemNotificacoes, marcarNotificacaoLidaApi,
  marcarTodasNotificacoesLidas, arquivarNotificacaoApi, desarquivarNotificacaoApi,
} from '../api/evolucoes';
import { useAuth } from '../context/AuthContext';
import { T } from '../theme';

// Ícone/cor por tipo real de notificação (o backend grava: transferencia,
// conversa_atribuida, fila, canal_desconectado). Os tipos legados ficam como
// fallback. Antes o mapa só cobria tipos que o backend nunca emite, então todas
// caíam no sino cinza.
const TIPOS = {
  transferencia: { icone: ArrowLeftRight, cor: '#3B82F6' },
  conversa_atribuida: { icone: UserCheck, cor: '#22C55E' },
  fila: { icone: Clock, cor: '#F59E0B' },
  canal_desconectado: { icone: WifiOff, cor: '#EF4444' },
  mensagem: { icone: MessageCircle, cor: '#3B82F6' },
  tarefa: { icone: CheckSquare, cor: '#F59E0B' },
  reuniao: { icone: Video, cor: '#22C55E' },
  arquivo: { icone: FileText, cor: '#8B5CF6' },
  sistema: { icone: AlertCircle, cor: '#6B7280' },
};
const infoTipo = (tipo) => TIPOS[tipo] || { icone: Bell, cor: '#6B7280' };

const TIPOS_FILTRO = [
  ['', 'Todos os tipos'],
  ['transferencia', 'Transferência'],
  ['conversa_atribuida', 'Conversa atribuída'],
  ['fila', 'Fila'],
  ['canal_desconectado', 'Canal desconectado'],
];

const LIMITE = 30;

function tempoRelativo(valor) {
  if (!valor) return '';
  const ms = Date.now() - new Date(valor).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} d`;
  return new Date(valor).toLocaleDateString('pt-BR');
}

function textoVazio(aba, busca) {
  if (busca) return 'Nenhum resultado para sua busca';
  if (aba === 'nao_lidas') return 'Você está em dia — nenhuma notificação não lida';
  if (aba === 'arquivadas') return 'Nenhuma notificação arquivada';
  return 'Nenhuma notificação';
}

export function CentroNotificacoes({ onCountChange, onAbrirLink }) {
  const { auth } = useAuth();
  const [notificacoes, setNotificacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('todas');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [tipo, setTipo] = useState('');
  const [temMais, setTemMais] = useState(false);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);
  const paginaRef = useRef(1);

  // Debounce da busca: evita um fetch por tecla.
  useEffect(() => {
    const id = setTimeout(() => setBuscaDebounced(busca.trim()), 350);
    return () => clearTimeout(id);
  }, [busca]);

  const carregar = useCallback(async ({ reset = true, silencioso = false } = {}) => {
    if (!silencioso) setLoading(true);
    setErro('');
    try {
      const paginaAlvo = reset ? 1 : paginaRef.current + 1;
      const data = await fetchNotificacoes({
        apenasNaoLidas: aba === 'nao_lidas',
        arquivadas: aba === 'arquivadas',
        busca: buscaDebounced,
        tipo,
        pagina: paginaAlvo,
        limite: LIMITE,
      });
      setNotificacoes((prev) => (reset ? data : [...prev, ...data]));
      paginaRef.current = paginaAlvo;
      setTemMais(data.length === LIMITE);
      const { total } = await fetchContagemNotificacoes();
      setTotalNaoLidas(total || 0);
      if (onCountChange) onCountChange(total || 0);
    } catch {
      setErro('Não foi possível carregar as notificações.');
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [aba, buscaDebounced, tipo, onCountChange]);

  // Recarrega (com debounce) sempre que filtros/busca mudam.
  useEffect(() => {
    const id = setTimeout(() => carregar({ reset: true }), 200);
    return () => clearTimeout(id);
  }, [carregar]);

  // Poll silencioso: mantém a lista fresca sem piscar o skeleton.
  useEffect(() => {
    const id = setInterval(() => carregar({ reset: true, silencioso: true }), 30000);
    return () => clearInterval(id);
  }, [carregar]);

  const marcarLida = async (n) => {
    if (!n || n.lida) return;
    try {
      await marcarNotificacaoLidaApi(n.id);
      setNotificacoes((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      const { total } = await fetchContagemNotificacoes();
      setTotalNaoLidas(total || 0);
      if (onCountChange) onCountChange(total || 0);
    } catch {
      setErro('Não foi possível marcar como lida.');
    }
  };

  const abrir = (n) => {
    marcarLida(n);
    if (n.link && onAbrirLink) onAbrirLink(n.link);
  };

  const marcarTodas = async () => {
    try {
      await marcarTodasNotificacoesLidas();
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
      setTotalNaoLidas(0);
      if (onCountChange) onCountChange(0);
    } catch {
      setErro('Não foi possível marcar todas como lidas.');
    }
  };

  const arquivar = async (event, id) => {
    event.stopPropagation();
    try {
      await arquivarNotificacaoApi(id);
      setNotificacoes((prev) => prev.filter((n) => n.id !== id));
      const { total } = await fetchContagemNotificacoes();
      setTotalNaoLidas(total || 0);
      if (onCountChange) onCountChange(total || 0);
    } catch {
      setErro('Não foi possível arquivar a notificação.');
    }
  };

  const desarquivar = async (event, id) => {
    event.stopPropagation();
    try {
      await desarquivarNotificacaoApi(id);
      setNotificacoes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setErro('Não foi possível desarquivar a notificação.');
    }
  };

  const mostrarMarcarTodas = aba !== 'arquivadas' && totalNaoLidas > 0;

  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg } },
    React.createElement('div', { style: { padding: '10px 16px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 } },
      React.createElement(Bell, { size: 20, color: T.primary }),
      React.createElement('span', { style: { fontWeight: 700, fontSize: 15, color: T.text } }, 'Notificações'),
      totalNaoLidas > 0 && React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: T.primary, background: T.primarySoft, borderRadius: 999, padding: '1px 8px' } }, totalNaoLidas),
      mostrarMarcarTodas && React.createElement('button', { onClick: marcarTodas, style: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: T.primary, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 } },
        React.createElement(CheckCheck, { size: 14 }), 'Marcar todas como lidas'),
    ),

    React.createElement('div', { style: { padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: T.surface, borderBottom: `1px solid ${T.border}` } },
      ...[
        ['todas', 'Todas'],
        ['nao_lidas', 'Não lidas'],
        ['arquivadas', 'Arquivadas'],
      ].map(([id, label]) => React.createElement('button', {
        key: id,
        onClick: () => setAba(id),
        'aria-pressed': aba === id,
        style: { border: `1px solid ${aba === id ? T.primary : T.border}`, background: aba === id ? `${T.primary}18` : T.surface, color: aba === id ? T.primary : T.text, borderRadius: 18, padding: '6px 12px', cursor: 'pointer' },
      }, label)),
      React.createElement('select', {
        value: tipo, onChange: (e) => setTipo(e.target.value), 'aria-label': 'Filtrar por tipo',
        style: { border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 8px', background: T.surface, color: T.text, fontSize: 12.5, cursor: 'pointer' },
      }, TIPOS_FILTRO.map(([v, l]) => React.createElement('option', { key: v, value: v }, l))),
      React.createElement('label', { style: { marginLeft: 'auto', minWidth: 180, flex: '0 1 280px', display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${T.border}`, borderRadius: 8, padding: '5px 8px', background: T.bg } },
        React.createElement(Search, { size: 15, color: T.textMuted }),
        React.createElement('input', { value: busca, onChange: (e) => setBusca(e.target.value), placeholder: 'Pesquisar notificações', 'aria-label': 'Pesquisar notificações', style: { border: 0, outline: 0, background: 'transparent', color: T.text, flex: 1, minWidth: 0 } }),
      ),
    ),

    erro && React.createElement('div', { role: 'alert', style: { margin: '10px 16px 0', padding: '8px 12px', borderRadius: 8, background: T.dangerSoft, color: T.danger, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 } },
      React.createElement(AlertCircle, { size: 15 }), erro),

    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 12 } },
      loading && notificacoes.length === 0
        ? React.createElement('div', { role: 'status', 'aria-label': 'Carregando notificações', style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            ...Array.from({ length: 6 }).map((_, i) => React.createElement('div', {
              key: i, style: { height: 58, borderRadius: 8, background: T.surfaceMuted, opacity: 0.7 },
            })),
          )
        : notificacoes.length === 0
        ? React.createElement('div', { style: { textAlign: 'center', color: T.textMuted, padding: 40 } }, textoVazio(aba, buscaDebounced))
        : React.createElement(React.Fragment, null,
            notificacoes.map((n) => {
              const { icone: Icon, cor: corIcon } = infoTipo(n.tipo);
              const clicavel = Boolean(n.link && onAbrirLink);
              return React.createElement('div', {
                key: n.id,
                role: clicavel ? 'button' : undefined,
                tabIndex: clicavel ? 0 : undefined,
                'aria-label': `${n.titulo}${n.lida ? ' (lida)' : ''}`,
                onClick: () => abrir(n),
                onKeyDown: (e) => { if (clicavel && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(n); } },
                style: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: n.lida ? T.bg : T.surface, borderRadius: 8, marginBottom: 4, cursor: clicavel ? 'pointer' : 'default', opacity: n.lida ? 0.72 : 1, border: n.lida ? '1px solid transparent' : `1px solid ${T.border}`, outlineOffset: 2 },
              },
                React.createElement('div', { style: { width: 32, height: 32, borderRadius: '50%', background: `${corIcon}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                  React.createElement(Icon, { size: 16, color: corIcon })),
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: T.text } }, n.titulo),
                  n.mensagem && React.createElement('div', { style: { fontSize: 12, color: T.textMuted, marginTop: 2 } }, n.mensagem),
                  React.createElement('div', { title: new Date(n.criado_em).toLocaleString('pt-BR'), style: { fontSize: 10.5, color: T.textMuted, marginTop: 4 } }, tempoRelativo(n.criado_em)),
                ),
                !n.lida && React.createElement('div', { 'aria-hidden': true, style: { width: 8, height: 8, borderRadius: '50%', background: T.primary, flexShrink: 0, marginTop: 4 } }),
                aba === 'arquivadas'
                  ? React.createElement('button', { onClick: (event) => desarquivar(event, n.id), title: 'Desarquivar', 'aria-label': 'Desarquivar notificação', style: { background: 'none', border: 0, cursor: 'pointer', padding: 4, color: T.textMuted } },
                      React.createElement(ArchiveRestore, { size: 15 }))
                  : React.createElement('button', { onClick: (event) => arquivar(event, n.id), title: 'Arquivar notificação', 'aria-label': 'Arquivar notificação', style: { background: 'none', border: 0, cursor: 'pointer', padding: 4, color: T.textMuted } },
                      React.createElement(Archive, { size: 15 })),
              );
            }),
            temMais && React.createElement('div', { style: { textAlign: 'center', padding: '12px 0' } },
              React.createElement('button', {
                onClick: () => carregar({ reset: false }), disabled: loading,
                style: { border: `1px solid ${T.borderStrong}`, background: T.surface, color: T.textSecondary, borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 },
              }, loading && React.createElement(Loader2, { size: 14, className: 'spin' }), 'Carregar mais'),
            ),
          ),
    ),
  );
}
