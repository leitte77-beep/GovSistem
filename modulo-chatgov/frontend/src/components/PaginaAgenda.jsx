import React, { useState, useEffect } from 'react';
import { Search, Edit3, Check, X, Phone, User, MessageCircle, Trash2, Filter, Grid3X3, List, Plus, Building2, Clock, MessageSquare, Star } from 'lucide-react';
import { T } from '../theme';
import { fetchContatos, editarContato, excluirContato, iniciarConversa, fetchDepartamentos } from '../api';
import { ModalNovaConversa } from './ModalNovaConversa';
import { Avatar } from './Avatar';

function formatarTelefone(tel) {
  if (!tel) return '';
  const d = tel.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) return `(${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9,13)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6,10)}`;
  return tel;
}

function tempoRelativo(dataStr) {
  if (!dataStr) return '';
  const agora = Date.now();
  const data = new Date(dataStr).getTime();
  const diffMin = Math.floor((agora - data) / 60000);
  if (diffMin < 1) return 'Agora mesmo';
  if (diffMin < 60) return `Há ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Ontem';
  if (diffD < 30) return `Há ${diffD}d`;
  return new Date(dataStr).toLocaleDateString('pt-BR');
}

function statusContato(c) {
  if (c.total_atendimentos > 10) return { label: 'Frequente', cor: '#7C3AED', bg: 'rgba(124,58,237,0.12)' };
  if (c.total_atendimentos > 3) return { label: 'Ativo', cor: '#2563EB', bg: 'rgba(37,99,235,0.12)' };
  if (c.total_atendimentos > 0) return { label: 'Contato', cor: '#16A34A', bg: 'rgba(22,163,74,0.12)' };
  return { label: 'Novo', cor: '#D97706', bg: 'rgba(217,119,6,0.12)' };
}

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'favoritos', label: 'Favoritos' },
  { key: 'recentes', label: 'Recentes' },
  { key: 'sem_nome', label: 'Sem nome' },
];

export function PaginaAgenda({ onSendMessage, breakpoint }) {
  const [contatos, setContatos] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [busca, setBusca] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [nomeEdit, setNomeEdit] = useState('');
  const [enviandoId, setEnviandoId] = useState(null);
  const [modoGrade, setModoGrade] = useState(false);
  const [filtroAtivo, setFiltroAtivo] = useState('todos');
  const [excluindoId, setExcluindoId] = useState(null);
  const [showNovaConversa, setShowNovaConversa] = useState(false);

  const carregar = async (q) => {
    try { setContatos(await fetchContatos(q)); } catch (e) { console.error(e); }
  };

  useEffect(() => { carregar(busca); }, [busca]);
  useEffect(() => { fetchDepartamentos().then(setDepartamentos).catch(console.error); }, []);

  const iniciarEdicao = (e, c) => {
    e.stopPropagation();
    setEditandoId(c.id);
    setNomeEdit(c.nome || '');
  };

  const salvar = async (id) => {
    try {
      await editarContato(id, { nome: nomeEdit.trim() || null });
      setEditandoId(null);
      carregar(busca);
    } catch (e) { console.error(e); }
  };

  const iniciarEnvio = async (e, c) => {
    e.stopPropagation();
    if (enviandoId) return;
    setEnviandoId(c.id);
    try {
      const conv = await iniciarConversa({ telefone: c.telefone });
      if (onSendMessage) onSendMessage(conv);
    } catch (e) { console.error(e); } finally { setEnviandoId(null); }
  };

  const confirmarExclusao = (e, id) => { e.stopPropagation(); setExcluindoId(id); };
  const cancelarExclusao = (e) => { e.stopPropagation(); setExcluindoId(null); };
  const executarExclusao = async (e, id) => {
    e.stopPropagation();
    try { await excluirContato(id); setExcluindoId(null); carregar(busca); }
    catch (err) { console.error(err); setExcluindoId(null); }
  };

  const ehMobile = breakpoint === 'mobile';
  const ehTablet = breakpoint === 'tablet';

  const contatosExibidos = [...contatos]
    .filter((c) => {
      if (filtroAtivo === 'favoritos') return false;
      if (filtroAtivo === 'recentes' && c.ultima_conversa_em) {
        return (Date.now() - new Date(c.ultima_conversa_em).getTime()) < 7 * 86400000;
      }
      if (filtroAtivo === 'sem_nome') return !c.nome || !c.nome.trim();
      return true;
    })
    .sort((a, b) => {
      const na = (a.nome || '').trim();
      const nb = (b.nome || '').trim();
      if (!na && !nb) return (a.telefone || '').localeCompare(b.telefone || '');
      if (!na) return 1;
      if (!nb) return -1;
      return na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
    });

  return React.createElement('div', { style: sf.container },
    React.createElement('div', { style: { ...sf.header, ...(ehMobile ? sf.headerMobile : null) } },
      React.createElement('div', { style: { ...sf.headerLeft, ...(ehMobile ? sf.headerLeftMobile : null) } },
        React.createElement('h1', { style: sf.title }, 'Contatos'),
        React.createElement('span', { style: { fontSize: 12, color: T.textMuted, fontWeight: 500, whiteSpace: 'nowrap' } },
          `${contatosExibidos.length} contatos`),
      ),
      React.createElement('div', { style: { ...sf.headerRight, ...(ehMobile ? sf.headerRightMobile : null) } },
        React.createElement('button', {
          onClick: () => setShowNovaConversa(true),
          style: { ...sf.btnPrimary, ...(ehMobile ? sf.btnPrimaryMobile : null) },
        }, React.createElement(Plus, { size: 17 }), ' Novo contato'),
      ),
    ),

    React.createElement('div', { style: { ...sf.toolbar, ...(ehMobile ? sf.toolbarMobile : null) } },
      React.createElement('div', { style: { ...sf.searchWrap, ...(ehMobile ? sf.searchWrapMobile : null) } },
        React.createElement(Search, { size: 18, color: T.textMuted, style: { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' } }),
        React.createElement('input', {
          value: busca, onChange: (e) => setBusca(e.target.value),
          placeholder: 'Pesquisar por nome ou telefone...',
          style: sf.searchInput,
        }),
      ),
      React.createElement('button', {
        onClick: () => setModoGrade(!modoGrade),
        style: sf.btnIcon,
        title: modoGrade ? 'Visualizar em lista' : 'Visualizar em grade',
        'aria-label': modoGrade ? 'Visualizar em lista' : 'Visualizar em grade',
      }, modoGrade ? React.createElement(List, { size: 20, color: T.textMuted }) : React.createElement(Grid3X3, { size: 20, color: T.textMuted })),
    ),

    React.createElement('div', { style: { padding: '0 28px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' } },
      ...FILTROS.map((f) =>
        React.createElement('button', {
          key: f.key,
          onClick: () => setFiltroAtivo(f.key),
          style: {
            padding: '6px 14px', borderRadius: 9999, fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', border: 'none', transition: 'all 0.15s',
            background: filtroAtivo === f.key ? T.primary : T.surfaceMuted,
            color: filtroAtivo === f.key ? '#fff' : T.textSecondary,
          },
        }, f.label),
      ),
    ),

    React.createElement('div', { style: { ...sf.content, ...(ehMobile ? sf.contentMobile : null) } },
      contatosExibidos.length === 0
        ? React.createElement('div', { style: sf.empty },
            React.createElement(User, { size: 52, color: T.textMuted, style: { opacity: 0.25 } }),
            React.createElement('div', { style: { fontSize: 15, fontWeight: 600, color: T.textMuted, marginTop: 12 } },
              busca ? 'Nenhum contato encontrado.' : 'Nenhum contato salvo.'),
            React.createElement('div', { style: { fontSize: 13, color: T.textMuted, marginTop: 4 } },
              'Os contatos aparecem aqui conforme interagem via WhatsApp.'),
          )
        : React.createElement('div', {
            style: {
              ...sf.grid,
              gridTemplateColumns: ehMobile ? '1fr' : modoGrade ? `repeat(auto-fill, minmax(${ehTablet ? 260 : 320}px, 1fr))` : '1fr',
            },
          },
            ...contatosExibidos.map((c, i) => modoGrade ? cardContato(c) : linhaContato(c)),
          ),
    ),

    showNovaConversa && React.createElement(ModalNovaConversa, {
      departamentos,
      onClose: () => setShowNovaConversa(false),
      onCriada: (conv) => { setShowNovaConversa(false); carregar(busca); if (onSendMessage && conv?.id) onSendMessage(conv); },
    }),
  );

  function cardContato(c) {
    const st = statusContato(c);
    const ultimaData = c.ultima_conversa_em ? tempoRelativo(c.ultima_conversa_em) : null;

    return React.createElement('div', { key: c.id, style: sf.card },
      React.createElement('div', { style: sf.cardTop },
        React.createElement(Avatar, { nome: c.nome || c.telefone, url: c.avatar_url, tamanho: 44, isNumber: !c.nome }),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          editandoId === c.id
            ? React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                React.createElement('input', {
                  value: nomeEdit, onChange: (e) => setNomeEdit(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter') salvar(c.id); if (e.key === 'Escape') setEditandoId(null); },
                  autoFocus: true, style: sf.editInput,
                }),
                React.createElement('button', { onClick: () => salvar(c.id), 'aria-label': `Salvar nome de ${c.nome || c.telefone}`, style: { ...sf.actionBtn, background: T.success, color: '#fff' } }, React.createElement(Check, { size: 14 })),
                React.createElement('button', { onClick: () => setEditandoId(null), 'aria-label': 'Cancelar edição do nome', style: { ...sf.actionBtn, background: T.surfaceMuted } }, React.createElement(X, { size: 14 })),
              )
            : React.createElement('div', {
                style: { fontSize: 15, fontWeight: 700, color: c.nome ? T.text : T.textMuted, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                onClick: (e) => iniciarEdicao(e, c), title: 'Clique para editar',
              }, c.nome || c.telefone || 'Sem nome'),
          React.createElement('div', { style: { fontSize: 12.5, color: T.textSecondary, display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 } },
            React.createElement(Phone, { size: 11 }), formatarTelefone(c.telefone) || 'Sem telefone',
          ),
        ),
      ),

      React.createElement('div', { style: sf.cardBody },
        React.createElement('span', {
          style: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: st.bg, color: st.cor },
        }, st.label),
        React.createElement('span', { style: { fontSize: 11, color: T.textMuted } },
          c.criado_em ? `Desde ${new Date(c.criado_em).toLocaleDateString('pt-BR')}` : ''),
      ),

      ultimaData && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: T.surfaceAlt, borderRadius: 8, fontSize: 11.5, color: T.textSecondary } },
        React.createElement(Clock, { size: 12, color: T.textMuted }),
        React.createElement('span', null, `Último atendimento: ${ultimaData}`),
        c.total_atendimentos > 0 && React.createElement('span', { style: { marginLeft: 'auto', fontWeight: 600, color: T.text } },
          `${c.total_atendimentos} atendimento${c.total_atendimentos > 1 ? 's' : ''}`),
      ),

      React.createElement('div', { style: sf.cardActions },
        React.createElement('button', {
          onClick: (e) => iniciarEnvio(e, c),
          disabled: editandoId === c.id || excluindoId === c.id,
          style: { ...sf.btnPrimary, fontSize: 12, padding: '7px 14px', opacity: editandoId === c.id ? 0.6 : 1 },
          title: 'Enviar mensagem',
        }, React.createElement(MessageCircle, { size: 14 }), ' Conversar'),
        React.createElement('button', { onClick: (e) => iniciarEdicao(e, c), style: sf.btnSec, title: 'Editar nome' },
          React.createElement(Edit3, { size: 14 }), ' Editar'),
        excluindoId === c.id
          ? React.createElement('div', { style: { display: 'flex', gap: 4, marginLeft: 'auto' } },
              React.createElement('button', { onClick: (e) => executarExclusao(e, c.id), 'aria-label': `Confirmar exclusão de ${c.nome || c.telefone}`, style: { ...sf.actionBtn, background: T.danger, color: '#fff' } }, React.createElement(Check, { size: 14 })),
              React.createElement('button', { onClick: (e) => cancelarExclusao(e), 'aria-label': 'Cancelar exclusão', style: { ...sf.actionBtn, background: T.surfaceMuted } }, React.createElement(X, { size: 14 })),
            )
          : React.createElement('button', {
              onClick: (e) => confirmarExclusao(e, c.id),
              style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: T.textMuted, cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6 },
              title: 'Excluir contato',
              onMouseEnter: (e) => { e.currentTarget.style.background = T.dangerSoft; e.currentTarget.style.color = T.danger; },
              onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; },
            }, React.createElement(Trash2, { size: 13 }), ' Excluir'),
      ),
    );
  }

  function linhaContato(c) {
    const st = statusContato(c);
    const ultimaData = c.ultima_conversa_em ? tempoRelativo(c.ultima_conversa_em) : null;

    return React.createElement('div', { key: c.id, style: sf.row },
      React.createElement(Avatar, { nome: c.nome || c.telefone, url: c.avatar_url, tamanho: 36, isNumber: !c.nome }),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        editandoId === c.id
          ? React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
              React.createElement('input', {
                value: nomeEdit, onChange: (e) => setNomeEdit(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') salvar(c.id); if (e.key === 'Escape') setEditandoId(null); },
                autoFocus: true,
                style: { fontSize: 14, fontWeight: 600, padding: '4px 8px', border: `2px solid ${T.primary}`, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none', width: '100%' },
              }),
              React.createElement('button', { onClick: () => salvar(c.id), 'aria-label': `Salvar nome de ${c.nome || c.telefone}`, style: { ...sf.actionBtn, background: T.success, color: '#fff' } }, React.createElement(Check, { size: 14 })),
              React.createElement('button', { onClick: () => setEditandoId(null), 'aria-label': 'Cancelar edição do nome', style: { ...sf.actionBtn, background: T.surfaceMuted } }, React.createElement(X, { size: 14 })),
            )
          : React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: c.nome ? T.text : T.textMuted, cursor: 'pointer' }, onClick: (e) => iniciarEdicao(e, c) },
                c.nome || c.telefone || 'Sem nome'),
              React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 9999, fontSize: 10, fontWeight: 600, background: st.bg, color: st.cor } }, st.label),
            ),
        React.createElement('div', { style: { fontSize: 12, color: T.textSecondary, marginTop: 1 } },
          formatarTelefone(c.telefone) + (ultimaData ? `  •  Último: ${ultimaData}` : '')),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
        excluindoId === c.id
          ? React.createElement(React.Fragment, null,
              React.createElement('button', { onClick: (e) => executarExclusao(e, c.id), 'aria-label': `Confirmar exclusão de ${c.nome || c.telefone}`, style: { ...sf.actionBtn, background: T.danger, color: '#fff' } }, React.createElement(Check, { size: 14 })),
              React.createElement('button', { onClick: (e) => cancelarExclusao(e), 'aria-label': 'Cancelar exclusão', style: { ...sf.actionBtn, background: T.surfaceMuted } }, React.createElement(X, { size: 14 })),
            )
          : React.createElement(React.Fragment, null,
              React.createElement('button', { onClick: (e) => iniciarEnvio(e, c), disabled: enviandoId === c.id, style: { ...sf.actionBtn, background: T.primary, color: '#fff', opacity: enviandoId === c.id ? 0.6 : 1 }, title: 'Enviar mensagem', 'aria-label': `Enviar mensagem para ${c.nome || c.telefone}` },
                React.createElement(MessageCircle, { size: 14 })),
              React.createElement('button', { onClick: (e) => iniciarEdicao(e, c), style: sf.actionBtnIcon, 'aria-label': `Editar ${c.nome || c.telefone}` },
                React.createElement(Edit3, { size: 14, color: T.textSecondary })),
              React.createElement('button', { onClick: (e) => confirmarExclusao(e, c.id), style: sf.actionBtnIcon, 'aria-label': `Excluir ${c.nome || c.telefone}` },
                React.createElement(Trash2, { size: 14, color: T.textSecondary })),
            ),
      ),
    );
  }
}

const sf = {
  container: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, overflow: 'hidden' },
  header: { padding: '14px 28px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerMobile: { padding: '16px 16px 12px', flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerLeftMobile: { alignItems: 'flex-start', gap: 8, minWidth: 0 },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: T.text, whiteSpace: 'nowrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  headerRightMobile: { width: '100%' },

  toolbar: { padding: '16px 28px 8px', display: 'flex', gap: 12, alignItems: 'center' },
  toolbarMobile: { padding: '12px 16px 8px', flexWrap: 'wrap', alignItems: 'stretch' },
  searchWrap: { flex: 1, position: 'relative' },
  searchWrapMobile: { flex: '1 0 100%' },
  searchInput: { width: '100%', height: 42, padding: '0 16px 0 40px', border: `1px solid ${T.border}`, borderRadius: T.radius, fontSize: 13, color: T.text, background: T.surface, outline: 'none', boxSizing: 'border-box' },

  content: { flex: 1, overflowY: 'auto', padding: '8px 28px 16px' },
  contentMobile: { padding: '8px 16px 16px' },
  grid: { display: 'grid', gap: 12, paddingBottom: 8 },

  card: {
    background: T.surface, borderRadius: T.radiusLg,
    border: `1px solid ${T.border}`,
    padding: '16px 18px 14px',
    display: 'flex', flexDirection: 'column', gap: 10,
    transition: 'box-shadow 0.15s, border-color 0.15s',
    cursor: 'default',
    position: 'relative', overflow: 'hidden',
  },
  cardTop: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  editInput: { fontSize: 14, fontWeight: 600, padding: '4px 8px', border: `2px solid ${T.primary}`, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none', flex: 1, minWidth: 0 },
  cardBody: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardActions: { display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, borderTop: `1px solid ${T.border}` },

  row: {
    display: 'flex', alignItems: 'center', padding: '12px 16px', background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}`, gap: 12, marginBottom: 6,
  },

  btnPrimary: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: T.primary, color: '#fff',
    border: 'none', borderRadius: T.radius,
    padding: '9px 18px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  btnPrimaryMobile: { width: '100%', justifyContent: 'center', minHeight: 40 },
  btnSec: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: T.surfaceAlt, color: T.textSecondary,
    border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
    padding: '7px 12px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  btnIcon: {
    width: 42, height: 42,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
    cursor: 'pointer',
  },
  actionBtn: { width: 30, height: 30, borderRadius: T.radiusSm, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  actionBtnIcon: { width: 38, height: 38, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: T.radiusSm },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 64, color: T.textMuted, gridColumn: '1 / -1' },
};
