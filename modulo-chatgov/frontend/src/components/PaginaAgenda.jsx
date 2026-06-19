import React, { useState, useEffect } from 'react';
import { Search, Edit3, Check, X, Phone, User, MessageCircle, Trash2, Filter, Grid3X3, List, Plus, Building2 } from 'lucide-react';
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

export function PaginaAgenda({ onSendMessage }) {
  const [contatos, setContatos] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [busca, setBusca] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [nomeEdit, setNomeEdit] = useState('');
  const [enviandoId, setEnviandoId] = useState(null);
  const [modoGrade, setModoGrade] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState('tudo');
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
    } catch (e) {
      console.error(e);
    }
  };

  const iniciarEnvio = async (e, c) => {
    e.stopPropagation();
    if (enviandoId) return;
    setEnviandoId(c.id);
    try {
      const conv = await iniciarConversa({ telefone: c.telefone });
      if (onSendMessage) onSendMessage(conv);
    } catch (e) {
      console.error(e);
    } finally {
      setEnviandoId(null);
    }
  };

  const confirmarExclusao = (e, id) => { e.stopPropagation(); setExcluindoId(id); };
  const cancelarExclusao = (e) => { e.stopPropagation(); setExcluindoId(null); };
  const executarExclusao = async (e, id) => {
    e.stopPropagation();
    try {
      await excluirContato(id);
      setExcluindoId(null);
      carregar(busca);
    } catch (err) {
      console.error(err);
      setExcluindoId(null);
    }
  };

  const abas = [
    { key: 'tudo', label: 'Tudo' },
    { key: 'favoritos', label: 'Favoritos' },
    { key: 'recentes', label: 'Recentes' },
    { key: 'grupos', label: 'Grupos' },
  ];

  const contatosExibidos = contatos;

  return React.createElement('div', { style: sf.container },
    /* ── HEADER ── */
    React.createElement('div', { style: sf.header },
      React.createElement('div', { style: sf.headerLeft },
        React.createElement('h1', { style: sf.title }, 'Agenda'),
        React.createElement('div', { style: sf.divider }),
        React.createElement('nav', { style: sf.tabs },
          ...abas.map((aba) =>
            React.createElement('button', {
              key: aba.key,
              onClick: () => setAbaAtiva(aba.key),
              style: {
                ...sf.tab,
                color: abaAtiva === aba.key ? T.primary : T.textMuted,
                borderBottom: abaAtiva === aba.key ? `2px solid ${T.primary}` : '2px solid transparent',
                fontWeight: abaAtiva === aba.key ? 600 : 400,
              },
            }, aba.label),
          ),
        ),
      ),
      React.createElement('div', { style: sf.headerRight },
        React.createElement('button', {
          onClick: () => setShowNovaConversa(true),
          style: sf.btnPrimary,
        },
          React.createElement(Plus, { size: 17 }),
          ' Novo contato',
        ),
      ),
    ),
    /* ── SEARCH BAR ── */
    React.createElement('div', { style: sf.toolbar },
      React.createElement('div', { style: sf.searchWrap },
        React.createElement(Search, { size: 18, color: T.textMuted, style: { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' } }),
        React.createElement('input', {
          value: busca,
          onChange: (e) => setBusca(e.target.value),
          placeholder: 'Pesquisar por nome ou telefone...',
          style: sf.searchInput,
        }),
      ),
      React.createElement('button', { style: sf.btnOutlined },
        React.createElement(Filter, { size: 17 }),
        ' Filtros',
      ),
      React.createElement('button', {
        onClick: () => setModoGrade(!modoGrade),
        style: sf.btnIcon,
        title: modoGrade ? 'Visualizar em lista' : 'Visualizar em grade',
      },
        modoGrade ? React.createElement(List, { size: 20, color: T.textMuted }) : React.createElement(Grid3X3, { size: 20, color: T.textMuted }),
      ),
    ),
    /* ── CONTENT ── */
    React.createElement('div', { style: sf.content },
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
              gridTemplateColumns: modoGrade ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr',
            },
          },
            ...contatosExibidos.map((c, i) => modoGrade ? cardContato(c, i) : linhaContato(c, i)),
          ),
    ),
    /* ── LOAD MORE ── */
    contatosExibidos.length > 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'center', padding: '24px 0' } },
      React.createElement('button', { style: sf.btnOutlined }, 'Carregar mais contatos'),
    ),
    /* ── MODAL NOVA CONVERSA ── */
    showNovaConversa && React.createElement(ModalNovaConversa, {
      departamentos,
      onClose: () => setShowNovaConversa(false),
      onCriada: (conv) => {
        setShowNovaConversa(false);
        carregar(busca);
        if (onSendMessage && conv?.id) onSendMessage(conv);
      },
    }),
  );

  /* ──────── CARD RENDER ──────── */
  function cardContato(c, i) {
    return React.createElement('div', {
      key: c.id,
      style: sf.card,
    },
      /* avatar + info */
      React.createElement('div', { style: sf.cardTop },
        React.createElement(Avatar, { nome: c.nome || c.telefone, url: c.avatar_url, tamanho: 52, isNumber: !c.nome }),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          editandoId === c.id
            ? React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                React.createElement('input', {
                  value: nomeEdit,
                  onChange: (e) => setNomeEdit(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter') salvar(c.id); if (e.key === 'Escape') setEditandoId(null); },
                  autoFocus: true,
                  style: sf.editInput,
                }),
                React.createElement('button', { onClick: () => salvar(c.id), style: { ...sf.actionBtn, background: T.success, color: '#fff' } },
                  React.createElement(Check, { size: 14 }),
                ),
                React.createElement('button', { onClick: () => setEditandoId(null), style: { ...sf.actionBtn, background: T.surfaceMuted } },
                  React.createElement(X, { size: 14 }),
                ),
              )
            : React.createElement('div', {
                style: { fontSize: 15, fontWeight: 700, color: c.nome ? T.text : T.textMuted, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                onClick: (e) => iniciarEdicao(e, c),
                title: 'Clique para editar',
              }, c.nome || c.telefone || 'Sem nome'),
          React.createElement('div', { style: { fontSize: 12, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 } },
            React.createElement(Phone, { size: 11 }),
            formatarTelefone(c.telefone) || 'Sem telefone',
          ),
          React.createElement('div', { style: { fontSize: 12, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 } },
            React.createElement(Building2, { size: 11 }),
            'Prefeitura Municipal',
          ),
        ),
        !editandoId && React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 8 } },
          React.createElement('button', {
            onClick: (e) => iniciarEnvio(e, c),
            disabled: editandoId === c.id || excluindoId === c.id,
            style: { ...sf.actionBtn, background: T.primary, color: '#fff', opacity: editandoId === c.id ? 0.6 : 1 },
            title: 'Enviar mensagem',
          }, React.createElement(MessageCircle, { size: 15 })),
          React.createElement('button', {
            onClick: (e) => iniciarEdicao(e, c),
            style: sf.actionBtnIcon,
            title: 'Editar nome',
          }, React.createElement(Edit3, { size: 15, color: T.textMuted })),
          excluindoId === c.id
            ? React.createElement('div', { style: { display: 'flex', gap: 2 } },
                React.createElement('button', {
                  onClick: (e) => executarExclusao(e, c.id),
                  style: { ...sf.actionBtn, background: T.danger, color: '#fff' },
                }, React.createElement(Check, { size: 15 })),
                React.createElement('button', {
                  onClick: (e) => cancelarExclusao(e),
                  style: { ...sf.actionBtn, background: T.surfaceMuted },
                }, React.createElement(X, { size: 15 })),
              )
            : React.createElement('button', {
                onClick: (e) => confirmarExclusao(e, c.id),
                style: sf.actionBtnIcon,
                title: 'Excluir',
              }, React.createElement(Trash2, { size: 15, color: T.textMuted })),
        ),
      ),
      /* footer */
      React.createElement('div', { style: sf.cardFooter },
        React.createElement('span', { style: { ...sf.badge, background: T.successSoft, color: T.success } },
          React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: T.success } }),
          ' Contato',
        ),
        React.createElement('span', { style: { fontSize: 11, color: T.textMuted } },
          c.criado_em ? `Desde ${new Date(c.criado_em).toLocaleDateString('pt-BR')}` : '',
        ),
      ),
    );
  }

  /* ──────── LIST ROW ──────── */
  function linhaContato(c, i) {
    return React.createElement('div', {
      key: c.id,
      style: sf.row,
    },
      React.createElement(Avatar, { nome: c.nome || c.telefone, url: c.avatar_url, tamanho: 40, isNumber: !c.nome }),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        editandoId === c.id
          ? React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
              React.createElement('input', {
                value: nomeEdit, onChange: (e) => setNomeEdit(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') salvar(c.id); if (e.key === 'Escape') setEditandoId(null); },
                autoFocus: true,
                style: { fontSize: 14, fontWeight: 600, padding: '4px 8px', border: `2px solid ${T.primary}`, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none', width: '100%' },
              }),
              React.createElement('button', { onClick: () => salvar(c.id), style: { ...sf.actionBtn, background: T.success, color: '#fff' } },
                React.createElement(Check, { size: 14 }),
              ),
              React.createElement('button', { onClick: () => setEditandoId(null), style: { ...sf.actionBtn, background: T.surfaceMuted } },
                React.createElement(X, { size: 14 }),
              ),
            )
          : React.createElement('div', { style: { fontSize: 14, fontWeight: 600, color: c.nome ? T.text : T.textMuted, cursor: 'pointer' }, onClick: (e) => iniciarEdicao(e, c) },
              c.nome || c.telefone || 'Sem nome'),
        React.createElement('div', { style: { fontSize: 12, color: T.textMuted } }, formatarTelefone(c.telefone)),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 4 } },
        excluindoId === c.id
          ? React.createElement('div', { style: { display: 'flex', gap: 4 } },
              React.createElement('button', { onClick: (e) => executarExclusao(e, c.id), style: { ...sf.actionBtn, background: T.danger, color: '#fff' } }, React.createElement(Check, { size: 14 })),
              React.createElement('button', { onClick: (e) => cancelarExclusao(e), style: { ...sf.actionBtn, background: T.surfaceMuted } }, React.createElement(X, { size: 14 })),
            )
          : React.createElement(React.Fragment, null,
              React.createElement('button', { onClick: (e) => iniciarEnvio(e, c), disabled: enviandoId === c.id, style: { ...sf.actionBtn, background: T.primary, color: '#fff', opacity: enviandoId === c.id ? 0.6 : 1 }, title: 'Enviar mensagem' },
                React.createElement(MessageCircle, { size: 14 }),
              ),
              React.createElement('button', { onClick: (e) => iniciarEdicao(e, c), style: sf.actionBtnIcon },
                React.createElement(Edit3, { size: 14, color: T.textMuted }),
              ),
              React.createElement('button', { onClick: (e) => confirmarExclusao(e, c.id), style: sf.actionBtnIcon },
                React.createElement(Trash2, { size: 14, color: T.textMuted }),
              ),
            ),
      ),
    );
  }
}

/* ──────── STYLES ──────── */
const sf = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#f0f2f5' },

  header: { padding: '14px 28px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: T.text, whiteSpace: 'nowrap' },
  divider: { width: 1, height: 24, background: T.border },
  tabs: { display: 'flex', gap: 24 },
  tab: { fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', transition: 'all 0.15s' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },

  toolbar: { padding: '16px 28px', display: 'flex', gap: 12, alignItems: 'center' },
  searchWrap: { flex: 1, position: 'relative' },
  searchInput: { width: '100%', height: 42, padding: '0 16px 0 40px', border: `1px solid ${T.border}`, borderRadius: T.radius, fontSize: 13, color: T.text, background: T.surface, outline: 'none', boxSizing: 'border-box' },

  content: { flex: 1, overflowY: 'auto', padding: '0 28px 16px' },
  grid: { display: 'grid', gap: 16, paddingBottom: 8 },

  card: {
    background: T.surface,
    borderRadius: T.radiusLg,
    border: `1px solid ${T.border}`,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    transition: 'box-shadow 0.15s, border-color 0.15s',
    cursor: 'default',
    position: 'relative',
    overflow: 'hidden',
  },
  cardTop: { display: 'flex', alignItems: 'flex-start', gap: 14 },
  editInput: { fontSize: 14, fontWeight: 600, padding: '4px 8px', border: `2px solid ${T.primary}`, borderRadius: T.radiusSm, color: T.text, background: T.surface, outline: 'none', flex: 1, minWidth: 0 },
  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: `1px solid ${T.border}` },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600 },

  row: {
    display: 'flex', alignItems: 'center', padding: '12px 16px', background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}`, gap: 12,
  },

  addCard: {
    minHeight: 170,
    border: `2px dashed ${T.border}`,
    borderRadius: T.radiusLg,
    background: '#fafbfc',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    cursor: 'pointer',
    color: T.textMuted,
    borderStyle: 'dashed',
  },

  btnPrimary: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: T.primary, color: '#fff',
    border: 'none', borderRadius: T.radius,
    padding: '9px 18px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  btnOutlined: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: T.surface, color: T.textMuted,
    border: `1px solid ${T.border}`, borderRadius: T.radius,
    padding: '9px 14px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  btnIcon: {
    width: 42, height: 42,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
    cursor: 'pointer',
  },

  actionBtn: {
    width: 30, height: 30,
    borderRadius: T.radiusSm, border: 'none',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  actionBtnIcon: {
    width: 30, height: 30,
    background: 'transparent', border: 'none',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: T.radiusSm,
  },

  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 64, color: T.textMuted, gridColumn: '1 / -1',
  },

  fab: {
    position: 'fixed', bottom: 28, right: 28,
    width: 52, height: 52, borderRadius: '50%',
    background: T.primary, color: '#fff',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
    zIndex: 40,
  },
};
