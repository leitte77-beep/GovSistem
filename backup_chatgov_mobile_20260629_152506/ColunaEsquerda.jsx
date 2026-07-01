import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Users, MessageSquarePlus } from 'lucide-react';
import { Chip } from './Chip';
import { ItemConversa } from './ItemConversa';
import { ItemCanal } from './ItemCanal';
import { ModalNovaConversa } from './ModalNovaConversa';
import { ModalSelecaoOperadores } from './ModalSelecaoOperadores';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { T } from '../theme';
import {
  fetchConversas, fetchDepartamentos, fetchCanaisInternos,
  fetchWhatsAppStatus, criarCanalInterno, fetchOperadores, excluirCanalInterno,
  fetchMe,
} from '../api';

export function ColunaEsquerda({
  view, onChange, onSelectConversa, onSelectCanal, onOpenQR,
  conversaAtivaId, canalAtivoId, recarregar,
}) {
  const { auth, logout } = useAuth();
  const { socket } = useSocket();
  const [conversas, setConversas] = useState([]);
  const [canais, setCanais] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [waStatus, setWaStatus] = useState({ status: 'desconectado', numero: null });
  const [waErro, setWaErro] = useState('');
  const [showNovaConversa, setShowNovaConversa] = useState(false);
  const [showNovoGrupo, setShowNovoGrupo] = useState(false);
  const [showNovaDM, setShowNovaDM] = useState(false);
  const [novoGrupoNome, setNovoGrupoNome] = useState('');
  const [novoGrupoMembros, setNovoGrupoMembros] = useState([]);
  const [showMenu, setShowMenu] = useState(false);

  const op = auth?.operador;
  const isAdmin = op?.papel === 'admin';
  const ehAtend = view === 'atendimento';
  const conectado = waStatus.status === 'conectado';
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    fetchMe().then((p) => setPerfil(p)).catch(() => {});
  }, []);

  // Filtros que o backend resolve diretamente vs. os resolvidos no cliente.
  const FILTROS_FIXOS = ['todas', 'naolidas', 'fila', 'arquivadas', 'minhas', 'resolvidas'];

  const carregarConversas = useCallback(async () => {
    setCarregando(true);
    try {
      const params = {};
      if (filtro === 'fila') params.status = 'fila';
      else if (filtro === 'arquivadas') params.arquivadas = 'true';
      else if (filtro === 'resolvidas') params.status = 'resolvida';
      else if (!FILTROS_FIXOS.includes(filtro)) params.departamento = filtro;
      if (busca) params.busca = busca;
      let lista = await fetchConversas(params);
      // 'naolidas' e 'minhas' o backend não filtra — resolvemos no cliente.
      if (filtro === 'naolidas') lista = lista.filter((c) => (c.nao_lidas || 0) > 0);
      else if (filtro === 'minhas') lista = lista.filter((c) => c.operador_id === op?.id);
      setConversas(lista);
    } catch (err) { console.error(err); }
    finally { setCarregando(false); }
  }, [filtro, busca, op?.id]);

  // Debounce do recarregamento: o backend dispara 'conversa:atualizada' a cada
  // mudança de status (tique entregue/lido) de qualquer mensagem do tenant. Sem
  // coalescer, isso gera uma enxurrada de GET /api/conversas e estoura o rate
  // limit do nginx (503). Juntamos eventos rápidos numa única busca.
  const carregarConversasRef = useRef(carregarConversas);
  useEffect(() => { carregarConversasRef.current = carregarConversas; }, [carregarConversas]);
  const debounceRef = useRef(null);
  const carregarConversasDebounced = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { carregarConversasRef.current?.(); }, 1500);
  }, []);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const carregarCanais = useCallback(async () => {
    try { setCanais(await fetchCanaisInternos()); } catch (err) { console.error(err); }
  }, []);

  const handleExcluirCanal = async (canalId) => {
    if (!confirm('Excluir este canal permanentemente?')) return;
    try {
      await excluirCanalInterno(canalId);
      carregarCanais();
    } catch (err) {
      console.error('Erro ao excluir canal:', err);
    }
  };

  useEffect(() => {
    fetchDepartamentos().then(setDepartamentos).catch(console.error);
    fetchOperadores().then(setOperadores).catch(console.error);
    fetchWhatsAppStatus().then(setWaStatus).catch(console.error);
  }, []);

  useEffect(() => { if (ehAtend) carregarConversas(); }, [ehAtend, carregarConversas, recarregar]);
  useEffect(() => { if (!ehAtend) carregarCanais(); }, [ehAtend, carregarCanais]);

  useEffect(() => {
    if (!socket) return;
    const onAtualizada = () => { if (ehAtend) carregarConversasDebounced(); };
    const onRemovida = ({ convId }) => {
      if (ehAtend) {
        setConversas((prev) => prev.filter((c) => c.id !== convId));
        if (conversaAtivaId === convId) onSelectConversa(null);
      }
    };
    const onConectado = ({ numero }) => { setWaStatus({ status: 'conectado', numero }); setWaErro(''); };
    const onDesconectado = () => setWaStatus({ status: 'desconectado', numero: null });
    const onFalha = ({ msg }) => { setWaStatus({ status: 'desconectado', numero: null }); setWaErro(msg || 'Falha na conexão do WhatsApp.'); };
    const onInterno = () => { if (!ehAtend) carregarCanais(); };
    socket.on('conversa:atualizada', onAtualizada);
    socket.on('conversa:removida', onRemovida);
    socket.on('whatsapp:conectado', onConectado);
    socket.on('whatsapp:desconectado', onDesconectado);
    socket.on('whatsapp:falha', onFalha);
    socket.on('interno:nova', onInterno);
    return () => {
      socket.off('conversa:atualizada', onAtualizada);
      socket.off('conversa:removida', onRemovida);
      socket.off('whatsapp:conectado', onConectado);
      socket.off('whatsapp:desconectado', onDesconectado);
      socket.off('whatsapp:falha', onFalha);
      socket.off('interno:nova', onInterno);
    };
  }, [socket, carregarConversasDebounced, carregarCanais, ehAtend, conversaAtivaId, onSelectConversa]);

  const criarDM = async (opId) => {
    try {
      const canal = await criarCanalInterno({ tipo: 'dm', membros: [op.id, opId] });
      await carregarCanais();
      onSelectCanal(canal);
      setShowNovaDM(false);
    } catch (err) { console.error(err); }
  };

  const criarGrupo = async () => {
    if (!novoGrupoNome.trim()) return;
    try {
      await criarCanalInterno({
        tipo: 'grupo', nome: novoGrupoNome.trim(),
        membros: [op.id, ...novoGrupoMembros],
      });
      setNovoGrupoNome(''); setNovoGrupoMembros([]); setShowNovoGrupo(false);
      await carregarCanais();
    } catch (err) { console.error(err); }
  };

  const countFila = conversas.filter((c) => c.status === 'fila').length;
  const countNaoLidas = conversas.reduce((sum, c) => sum + (c.nao_lidas || 0), 0);

  return React.createElement('aside', {
    style: {
      width: 400, minWidth: 400, height: '100%',
      background: T.surface, display: 'flex', flexDirection: 'column',
      borderRight: `1px solid #d1d7db`, zIndex: 40, flexShrink: 0,
    },
  },
    React.createElement('div', {
      style: {
        height: 64, padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#e9edef',
      },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        React.createElement('div', {
          style: {
            width: 40, height: 40, borderRadius: '50%', background: '#d1d7db', overflow: 'hidden', flexShrink: 0,
          },
        },
          React.createElement('img', {
            src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDWXpi2JDvKBEkcu7_YfO6_w12It6i7eG2uBHgM80iLJyJNapgyZ9FvryhZKZOvkZ0HfQ8UOffLJKikKUMdWkPkMojzlgM--yfsZHegUzukatQ9FOsP6cXhLR1dmNbb5LlN3xv7C0b8I-U0e4hPdRGZANuz1g5hjmKRs4Cq4Ts6Tf2K8Akc7dA8lXwDO35OcuejTMjz--ZWBfQvnDWq3xg2OOHLkId55ZA8kdQxdQTSmUNrWMYHPGsk0ikJAYAAaO9HxW1jGrfFBWsp',
            alt: 'Avatar',
            style: { width: '100%', height: '100%', objectFit: 'cover' },
          }),
        ),
        React.createElement('div', { style: { lineHeight: 1.2, minWidth: 0, flex: 1 } },
          React.createElement('p', {
            title: perfil?.nome || '',
            style: { fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, perfil?.nome || 'Carregando...'),
          React.createElement('p', { style: { fontSize: 11, color: T.textMuted, textTransform: 'capitalize' } }, perfil?.papel || op?.papel || 'operador'),
        ),
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
        React.createElement('button', {
          title: 'Notificações',
          onClick: () => onChange?.('notificacoes'),
          style: { padding: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.textMuted, display: 'flex' },
        },
          React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 20 } }, 'circle_notifications')),
        React.createElement('button', {
          title: 'Nova conversa',
          onClick: () => setShowNovaConversa(true),
          style: { padding: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.textMuted, display: 'flex' },
        },
          React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 20 } }, 'chat_bubble')),
        React.createElement('div', { style: { position: 'relative', display: 'flex' } },
          React.createElement('button', {
            title: 'Mais opções',
            onClick: () => setShowMenu((v) => !v),
            style: { padding: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', background: showMenu ? T.primarySoft : 'transparent', color: showMenu ? T.primary : T.textMuted, display: 'flex' },
          },
            React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 20 } }, 'more_vert')),
          showMenu && React.createElement(React.Fragment, null,
            React.createElement('div', {
              onClick: () => setShowMenu(false),
              style: { position: 'fixed', inset: 0, zIndex: 998 },
            }),
            React.createElement('div', {
              style: {
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                minWidth: 200, background: '#fff', border: '1px solid #d1d7db',
                borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 999, overflow: 'hidden', padding: '4px 0',
              },
            },
              React.createElement('div', { style: { padding: '8px 14px', borderBottom: '1px solid #eef2f6' } },
                React.createElement('p', {
                  style: { fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                }, perfil?.nome || op?.nome || ''),
                React.createElement('p', {
                  style: { fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                }, perfil?.email || op?.email || ''),
              ),
              isAdmin && React.createElement('button', {
                onClick: () => { setShowMenu(false); onChange?.('configuracoes'); },
                style: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: T.text, fontSize: 13, textAlign: 'left' },
              },
                React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 19, color: T.textMuted } }, 'settings'),
                'Configurações'),
              React.createElement('button', {
                onClick: () => { setShowMenu(false); logout(); },
                style: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: T.danger, fontSize: 13, fontWeight: 600, textAlign: 'left' },
              },
                React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 19 } }, 'logout'),
                'Sair'),
            ),
          ),
        ),
      ),
    ),

    ehAtend && React.createElement('div', {
      style: {
        padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: T.whatsappGreenSoft, borderBottom: '1px solid #d1d7db',
      },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: isAdmin ? 'pointer' : 'default' }, onClick: isAdmin ? onOpenQR : undefined },
        React.createElement('span', {
          className: 'material-symbols-outlined',
          style: { fontSize: 18, color: T.whatsappGreen, fontVariationSettings: "'FILL' 1" },
        }, 'check_circle'),
        React.createElement('span', { style: { fontSize: 12, fontWeight: 500, color: isAdmin && !conectado ? T.danger : '#004a1c' } },
          conectado
            ? `WhatsApp conectado \u2022 ${waStatus.numero || ''}`
            : isAdmin ? 'WhatsApp desconectado \u2014 toque para conectar' : 'WhatsApp desconectado'),
      ),
      isAdmin && React.createElement('button', {
        onClick: onOpenQR,
        style: { fontSize: 11, fontWeight: 700, color: T.primary, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' },
      }, 'ALTERAR'),
    ),

    // Banner de falha de conexão do WhatsApp (esgotou reconexões).
    ehAtend && waErro && React.createElement('div', {
      role: 'alert',
      style: { padding: '8px 16px', background: T.dangerSoft, color: T.danger, fontSize: 12, fontWeight: 600, borderBottom: '1px solid #d1d7db', display: 'flex', alignItems: 'center', gap: 8 },
    },
      React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 16 } }, 'error'),
      React.createElement('span', { style: { flex: 1 } }, waErro),
      isAdmin && React.createElement('button', { onClick: onOpenQR, style: { fontSize: 11, fontWeight: 700, color: T.danger, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' } }, 'RECONECTAR'),
    ),

    // Seach
    React.createElement('div', { style: { padding: '12px 16px' } },
      React.createElement('div', {
        style: { position: 'relative', marginBottom: 8 },
      },
        React.createElement('span', {
          className: 'material-symbols-outlined',
          style: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, fontSize: 20 },
        }, 'search'),
        React.createElement('input', {
          value: busca, onChange: (e) => setBusca(e.target.value),
          placeholder: 'Pesquisar ou come\u00e7ar uma nova conversa',
          style: {
            width: '100%', background: '#e9edef', border: 'none', borderRadius: 8,
            padding: '10px 12px 10px 44px', color: T.text, fontSize: 14, outline: 'none',
            boxSizing: 'border-box',
          },
        }),
      ),

      React.createElement('div', { style: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 } },
        React.createElement(Chip, { label: 'Tudo', ativo: filtro === 'todas', onClick: () => setFiltro('todas') }),
        React.createElement(Chip, { label: 'Minhas', ativo: filtro === 'minhas', onClick: () => setFiltro('minhas') }),
        React.createElement(Chip, { label: 'N\u00e3o lidas', ativo: filtro === 'naolidas', onClick: () => setFiltro('naolidas'), badge: countNaoLidas }),
        React.createElement(Chip, { label: 'Fila', ativo: filtro === 'fila', onClick: () => setFiltro('fila'), badge: countFila }),
        React.createElement(Chip, { label: 'Resolvidas', ativo: filtro === 'resolvidas', onClick: () => setFiltro('resolvidas') }),
        React.createElement(Chip, { label: 'Arquivadas', ativo: filtro === 'arquivadas', onClick: () => setFiltro('arquivadas') }),
        departamentos.map((dep) =>
          React.createElement(Chip, {
            key: dep.id, label: dep.nome, ativo: filtro === dep.id, cor: dep.cor,
            onClick: () => setFiltro(filtro === dep.id ? 'todas' : dep.id),
          })),
      ),
    ),

    // List
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: '4px 8px 8px' } },
      ehAtend
        ? (carregando && conversas.length === 0
            ? React.createElement(SkeletonLista, null)
            : conversas.length === 0
            ? React.createElement(VazioLista, { texto: 'Inicie uma conversa para ver suas mensagens aqui.' })
            : conversas.map((c) => React.createElement(ItemConversa, {
                key: c.id, conversa: c, ativa: c.id === conversaAtivaId, opId: op?.id,
                onClick: () => {
                  if (c.nao_lidas > 0) {
                    setConversas((prev) => prev.map((conv) => conv.id === c.id ? { ...conv, nao_lidas: 0 } : conv));
                  }
                  onSelectConversa(c);
                },
              })))
        : (canais.length === 0
            ? React.createElement(VazioLista, { texto: 'Crie uma conversa ou grupo com sua equipe.' })
            : canais.map((c) => React.createElement(ItemCanal, {
                key: c.id, canal: c, ativo: c.id === canalAtivoId, opId: op?.id, onClick: () => onSelectCanal(c),
                onDelete: handleExcluirCanal,
              }))),
    ),

    // Action button
    React.createElement('div', { style: { padding: '12px 16px', borderTop: `1px solid ${T.border}` } },
      ehAtend
        ? React.createElement('button', {
            onClick: () => setShowNovaConversa(true),
            style: {
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px', borderRadius: T.radius, border: 'none', cursor: 'pointer',
              background: T.primary, color: '#fff', fontSize: 14, fontWeight: 600,
              boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
            },
          }, React.createElement(MessageSquarePlus, { size: 18 }), 'Nova conversa')
        : React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', {
              onClick: () => setShowNovaDM(true),
              style: {
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: T.radius, border: 'none', cursor: 'pointer',
                background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600,
              },
            }, React.createElement(Plus, { size: 16 }), 'Nova Mensagem'),
            React.createElement('button', {
              onClick: () => setShowNovoGrupo(true),
              style: {
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: T.radius, border: 'none', cursor: 'pointer',
                background: T.surfaceMuted, color: T.text, fontSize: 13, fontWeight: 600,
              },
            }, React.createElement(Users, { size: 16 }), 'Novo grupo'),
          ),
    ),

    // Modals
    showNovaConversa && React.createElement(ModalNovaConversa, {
      departamentos,
      onClose: () => setShowNovaConversa(false),
      onCriada: (conv) => { setShowNovaConversa(false); carregarConversas(); if (conv?.id) onSelectConversa(conv); },
    }),

    showNovaDM && React.createElement(ModalSelecaoOperadores, {
      titulo: 'Nova conversa interna', operadores: operadores.filter((o) => o.id !== op?.id),
      selecaoUnica: true, onClose: () => setShowNovaDM(false), onConfirmar: (ids) => criarDM(ids[0]),
    }),

    showNovoGrupo && React.createElement('div', { style: overlay },
      React.createElement('div', { style: modalCard },
        React.createElement('h3', { style: modalTitulo }, 'Novo grupo'),
        React.createElement('input', {
          value: novoGrupoNome, onChange: (e) => setNovoGrupoNome(e.target.value), placeholder: 'Nome do grupo',
          style: inputStyle,
        }),
        React.createElement('div', { style: { maxHeight: 220, overflowY: 'auto', margin: '12px 0' } },
          operadores.filter((o) => o.id !== op?.id).map((o) =>
            React.createElement('label', { key: o.id, style: linhaSelecao },
              React.createElement('input', {
                type: 'checkbox', checked: novoGrupoMembros.includes(o.id),
                onChange: () => setNovoGrupoMembros((prev) => prev.includes(o.id) ? prev.filter((i) => i !== o.id) : [...prev, o.id]),
              }),
              o.nome,
            ))),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', { onClick: () => { setShowNovoGrupo(false); setNovoGrupoNome(''); }, style: btnSecundario }, 'Cancelar'),
          React.createElement('button', { onClick: criarGrupo, style: btnPrimario }, 'Criar grupo'),
        ),
      ),
    ),
  );
}

function SkeletonLista() {
  return React.createElement('div', { style: { padding: '8px 4px' }, 'aria-busy': true, 'aria-label': 'Carregando conversas' },
    [0, 1, 2, 3, 4, 5].map((i) =>
      React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px' } },
        React.createElement('div', { className: 'skeleton-pulse', style: { width: 48, height: 48, borderRadius: '50%', background: T.surfaceMuted, flexShrink: 0 } }),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('div', { className: 'skeleton-pulse', style: { width: '60%', height: 12, borderRadius: 6, background: T.surfaceMuted, marginBottom: 8 } }),
          React.createElement('div', { className: 'skeleton-pulse', style: { width: '85%', height: 10, borderRadius: 6, background: T.surfaceMuted } }),
        ),
      )),
  );
}

function VazioLista({ texto }) {
  return React.createElement('div', {
    style: { padding: '64px 24px', textAlign: 'center', color: T.textMuted, fontSize: 13 },
  },
    React.createElement('span', {
      className: 'material-symbols-outlined',
      style: { fontSize: 48, marginBottom: 16, display: 'block', opacity: 0.4, fontVariationSettings: "'FILL' 0" },
    }, 'forum'),
    React.createElement('p', null, texto),
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(15,26,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalCard = { background: T.surface, borderRadius: T.radiusLg, padding: 24, maxWidth: 440, width: '90%', boxShadow: T.shadowLg };
const modalTitulo = { fontSize: 18, fontWeight: 700, marginBottom: 14, color: T.text };
const inputStyle = { width: '100%', padding: '11px 13px', background: T.surfaceMuted, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const linhaSelecao = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', color: T.text, fontSize: 14, cursor: 'pointer' };
const btnSecundario = { background: 'transparent', border: `1px solid ${T.borderStrong}`, color: T.textSecondary, padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 500 };
const btnPrimario = { background: T.primary, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: T.radiusSm, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

