import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

function formatarTelefone(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (digitos.length === 13 && digitos.startsWith('55')) {
    return `+55 ${digitos.slice(2, 4)} ${digitos.slice(4, 9)}-${digitos.slice(9)}`;
  }
  if (digitos.length === 12 && digitos.startsWith('55')) {
    return `+55 ${digitos.slice(2, 4)} ${digitos.slice(4, 8)}-${digitos.slice(8)}`;
  }
  return numero || '';
}

const CHAVE_FIXADAS = 'chatgov_conversas_fixadas';

// Conversa parada há mais tempo que isso, esperando resposta nossa, entra no
// filtro "Atrasadas". Não é SLA formal — é o corte prático de quem atende.
const HORAS_ATRASO = 4;

const ENCERRADAS = ['RESOLVIDA', 'resolvida', 'ARQUIVADA', 'arquivada'];
const emAberto = (c) => !ENCERRADAS.includes(c.status_operacional || c.status);

const SEM_RESPONSAVEL = (c) => !c.operador_id && emAberto(c);
const COM_PROTOCOLO = (c) => Boolean(c.protocolo_id || c.protocolo_numero || c.protocolo);
// Atrasada = cidadão esperando (última mensagem foi dele) há mais de HORAS_ATRASO.
const ATRASADA = (c) => {
  if (!emAberto(c) || (c.nao_lidas || 0) === 0 || !c.ultima_mensagem_em) return false;
  return Date.now() - new Date(c.ultima_mensagem_em).getTime() > HORAS_ATRASO * 3600_000;
};

export function ColunaEsquerda({
  view, onChange, onSelectConversa, onSelectCanal, onOpenQR,
  conversaAtivaId, canalAtivoId, recarregar,
  breakpoint,
}) {
  const { auth, logout } = useAuth();
  const { socket } = useSocket();
  const [conversas, setConversas] = useState([]);
  const [canais, setCanais] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [filtro, setFiltro] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('filtro')
        || localStorage.getItem('chatgov_filtro_conversas') || 'todas';
    } catch { return 'todas'; }
  });
  const [busca, setBusca] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('busca') || ''; }
    catch { return ''; }
  });
  const [fixadas, setFixadas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE_FIXADAS) || '[]'); } catch { return []; }
  });
  const [carregando, setCarregando] = useState(false);
  const [waStatus, setWaStatus] = useState({ status: 'desconectado', numero: null });
  const [waErro, setWaErro] = useState('');
  const [showNovaConversa, setShowNovaConversa] = useState(false);
  const [showNovoGrupo, setShowNovoGrupo] = useState(false);
  const [showNovaDM, setShowNovaDM] = useState(false);
  const [novoGrupoNome, setNovoGrupoNome] = useState('');
  const [novoGrupoMembros, setNovoGrupoMembros] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showFiltros, setShowFiltros] = useState(false);
  const [contagens, setContagens] = useState({
    todas: 0, minhas: 0, naolidas: 0, fila: 0,
    aguardando_cidadao: 0, aguardando_setor: 0, resolvidas: 0, arquivadas: 0,
  });
  const [larguraDesktop, setLarguraDesktop] = useState(() => {
    try {
      return Math.min(560, Math.max(380, Number(localStorage.getItem('chatgov_largura_lista')) || 460));
    } catch { return 460; }
  });
  const buscaRef = useRef(null);

  const op = auth?.operador;
  const isAdmin = op?.papel === 'admin';
  const ehAtend = view === 'atendimento';
  const conectado = waStatus.status === 'conectado';
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    fetchMe().then((p) => setPerfil(p)).catch(() => {});
  }, []);

  // Persiste por usuário/navegador e mantém URL compartilhável.
  useEffect(() => {
    try {
      localStorage.setItem('chatgov_filtro_conversas', filtro);
      const url = new URL(window.location.href);
      if (filtro && filtro !== 'todas') url.searchParams.set('filtro', filtro);
      else url.searchParams.delete('filtro');
      if (busca) url.searchParams.set('busca', busca);
      else url.searchParams.delete('busca');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }, [filtro, busca]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        buscaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Filtros que o backend resolve diretamente vs. os resolvidos no cliente.
  const FILTROS_FIXOS = [
    'todas', 'naolidas', 'fila', 'aguardando_cidadao',
    'aguardando_setor', 'arquivadas', 'minhas', 'resolvidas',
    'sem_responsavel', 'com_protocolo', 'atrasadas',
  ];

  const carregarConversas = useCallback(async () => {
    setCarregando(true);
    try {
      const params = {};
      if (filtro === 'fila') params.status = 'NA_FILA';
      else if (filtro === 'aguardando_cidadao') params.status = 'AGUARDANDO_CIDADAO';
      else if (filtro === 'aguardando_setor') params.status = 'AGUARDANDO_SETOR';
      else if (filtro === 'arquivadas') params.arquivadas = 'true';
      else if (filtro === 'resolvidas') params.status = 'RESOLVIDA';
      else if (!FILTROS_FIXOS.includes(filtro)) params.departamento = filtro;
      if (busca) params.busca = busca;
      const precisaBase = filtro !== 'todas';
      const [resultado, baseResultado] = await Promise.all([
        fetchConversas(params),
        precisaBase ? fetchConversas(busca ? { busca } : {}) : Promise.resolve(null),
      ]);
      let lista = resultado;
      const base = baseResultado || resultado;
      // Estes o backend não filtra — resolvemos no cliente sobre a lista já carregada.
      if (filtro === 'naolidas') lista = lista.filter((c) => (c.nao_lidas || 0) > 0);
      else if (filtro === 'minhas') lista = lista.filter((c) => c.operador_id === op?.id);
      else if (filtro === 'sem_responsavel') lista = lista.filter(SEM_RESPONSAVEL);
      else if (filtro === 'com_protocolo') lista = lista.filter(COM_PROTOCOLO);
      else if (filtro === 'atrasadas') lista = lista.filter(ATRASADA);
      setConversas(lista);
      setContagens({
        todas: base.length,
        minhas: base.filter((c) => c.operador_id === op?.id).length,
        naolidas: base.filter((c) => (c.nao_lidas || 0) > 0).length,
        fila: base.filter((c) => ['NA_FILA', 'fila'].includes(c.status_operacional || c.status)).length,
        aguardando_cidadao: base.filter((c) => (c.status_operacional || c.status) === 'AGUARDANDO_CIDADAO').length,
        aguardando_setor: base.filter((c) => (c.status_operacional || c.status) === 'AGUARDANDO_SETOR').length,
        resolvidas: base.filter((c) => ['RESOLVIDA', 'resolvida'].includes(c.status_operacional || c.status)).length,
        arquivadas: base.filter((c) => Boolean(c.arquivada_em) || ['ARQUIVADA', 'arquivada'].includes(c.status_operacional || c.status)).length,
        sem_responsavel: base.filter(SEM_RESPONSAVEL).length,
        com_protocolo: base.filter(COM_PROTOCOLO).length,
        atrasadas: base.filter(ATRASADA).length,
      });
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

  const ehMobile = breakpoint === 'mobile';
  const ehTablet = breakpoint === 'tablet';
  const larguraPainel = ehMobile ? '100%' : ehTablet ? 320 : larguraDesktop;
  const filtrosPrincipais = new Set(['todas', 'minhas', 'naolidas', 'fila']);
  const filtroSecundarioAtivo = !filtrosPrincipais.has(filtro);

  // Conversas fixadas ficam por operador, neste navegador: é preferência de
  // trabalho individual e não justifica ida ao banco.
  const alternarFixada = useCallback((convId) => {
    setFixadas((prev) => {
      const proximo = prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId];
      try { localStorage.setItem(CHAVE_FIXADAS, JSON.stringify(proximo)); } catch {}
      return proximo;
    });
  }, []);

  // Fixadas sobem para o topo preservando a ordem que o backend devolveu (mais
  // recentes primeiro) dentro de cada grupo.
  const conversasOrdenadas = useMemo(() => {
    if (fixadas.length === 0) return conversas;
    const fixadasSet = new Set(fixadas);
    return [...conversas].sort((a, b) => (fixadasSet.has(b.id) ? 1 : 0) - (fixadasSet.has(a.id) ? 1 : 0));
  }, [conversas, fixadas]);

  const redimensionar = (event) => {
    if (ehMobile || ehTablet) return;
    event.preventDefault();
    const inicioX = event.clientX;
    const inicioLargura = larguraDesktop;
    const mover = (e) => setLarguraDesktop(Math.min(560, Math.max(380, inicioLargura + e.clientX - inicioX)));
    const parar = () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', parar);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', parar);
  };

  useEffect(() => {
    if (ehMobile || ehTablet) return;
    try { localStorage.setItem('chatgov_largura_lista', String(larguraDesktop)); } catch {}
  }, [larguraDesktop, ehMobile, ehTablet]);

  return React.createElement('aside', {
    style: {
      width: larguraPainel, minWidth: ehMobile ? 0 : larguraPainel, height: '100%',
      background: T.surface, display: 'flex', flexDirection: 'column',
      borderRight: ehMobile ? 'none' : `1px solid ${T.border}`, zIndex: 40, flexShrink: 0,
      position: 'relative',
    },
  },
    React.createElement('div', {
      style: {
        height: 64, padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: T.surfaceMuted,
      },
    },
      ehMobile
        ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
            React.createElement('div', {
              'aria-hidden': true,
              style: { width: 36, height: 36, borderRadius: '50%', background: T.primarySoft, color: T.primary, display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 },
            }, (perfil?.nome || op?.nome || '?').trim().charAt(0).toUpperCase()),
            React.createElement('div', { style: { minWidth: 0 } },
              React.createElement('h1', { style: { fontSize: 16, fontWeight: 750, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, perfil?.nome || op?.nome || 'Atendimento'),
              React.createElement('p', { style: { fontSize: 11, color: T.textSecondary, textTransform: 'capitalize' } }, perfil?.papel || op?.papel || 'operador'),
            ),
          )
        : React.createElement('div', null,
            React.createElement('h2', { style: { fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: -0.3 } }, ehAtend ? 'Conversas' : 'Equipe'),
            React.createElement('p', { style: { fontSize: 11, color: T.textSecondary, marginTop: 2 } }, ehAtend ? `${contagens.todas} atendimento(s)` : `${canais.length} conversa(s)`),
          ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
        React.createElement('button', {
          title: 'Notificações',
          'aria-label': 'Abrir notificações',
          onClick: () => onChange?.('notificacoes'),
          style: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.textSecondary, display: 'flex' },
        },
          React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 20 } }, 'circle_notifications')),
        React.createElement('button', {
          title: 'Nova conversa',
          'aria-label': 'Iniciar nova conversa',
          onClick: () => setShowNovaConversa(true),
          style: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.textSecondary, display: 'flex' },
        },
          React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 20 } }, 'chat_bubble')),
        React.createElement('div', { style: { position: 'relative', display: 'flex' } },
          React.createElement('button', {
            title: 'Mais opções',
            'aria-label': 'Abrir mais opções',
            'aria-expanded': showMenu,
            onClick: () => setShowMenu((v) => !v),
            style: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', cursor: 'pointer', background: showMenu ? T.primarySoft : 'transparent', color: showMenu ? T.primary : T.textSecondary, display: 'flex' },
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
                minWidth: 200, background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 999, overflow: 'hidden', padding: '4px 0',
              },
            },
              React.createElement('div', { style: { padding: '8px 14px', borderBottom: `1px solid ${T.border}` } },
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
        background: conectado ? T.whatsappStatusBg : T.dangerSoft, borderBottom: `1px solid ${T.border}`,
      },
    },
      React.createElement('button', {
        type: 'button',
        disabled: !isAdmin,
        onClick: isAdmin ? onOpenQR : undefined,
        'aria-label': conectado ? `WhatsApp conectado em ${formatarTelefone(waStatus.numero)}` : 'WhatsApp desconectado',
        style: {
          display: 'flex', alignItems: 'center', gap: 8, cursor: isAdmin ? 'pointer' : 'default',
          minWidth: 0, background: 'transparent', border: 'none', padding: 0, textAlign: 'left',
        },
      },
        React.createElement('span', {
          className: 'material-symbols-outlined',
          style: { fontSize: 18, color: conectado ? T.whatsappStatusIcon : T.dangerDark, fontVariationSettings: "'FILL' 1" },
        }, conectado ? 'check_circle' : 'error'),
        React.createElement('span', { style: { fontSize: 12, fontWeight: 650, color: !conectado ? T.dangerDark : T.whatsappStatusText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          conectado
            ? `WhatsApp conectado · ${formatarTelefone(waStatus.numero)}`
            : isAdmin && !ehMobile ? 'WhatsApp desconectado — toque para conectar' : 'WhatsApp desconectado'),
      ),
      isAdmin && React.createElement('button', {
        onClick: onOpenQR,
        'aria-label': 'Gerenciar conexão do WhatsApp',
        style: { minHeight: 36, padding: '0 4px', fontSize: 11, fontWeight: 750, color: T.primary, background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' },
      }, 'Gerenciar'),
    ),

    // Banner de falha de conexão do WhatsApp (esgotou reconexões).
    ehAtend && waErro && React.createElement('div', {
      role: 'alert',
      style: { padding: '8px 16px', background: T.dangerSoft, color: T.danger, fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 },
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
          ref: buscaRef,
          value: busca, onChange: (e) => setBusca(e.target.value),
          placeholder: 'Pesquisar ou come\u00e7ar uma nova conversa',
          'aria-label': 'Pesquisar conversas por nome ou telefone',
          style: {
            width: '100%',         background: T.surfaceMuted, border: 'none', borderRadius: 8,
            padding: '10px 12px 10px 44px', color: T.text, fontSize: 14, outline: 'none',
            boxSizing: 'border-box',
          },
        }),
      ),

      React.createElement('div', { role: 'group', 'aria-label': 'Filtros rápidos de conversas', style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        React.createElement(Chip, { label: 'Tudo', icone: 'inbox', titulo: 'Todas as conversas do seu acesso', ativo: filtro === 'todas', onClick: () => setFiltro('todas'), badge: contagens.todas }),
        React.createElement(Chip, { label: 'Minhas', icone: 'person', titulo: 'Conversas em que você é o atendente responsável', ativo: filtro === 'minhas', onClick: () => setFiltro('minhas'), badge: contagens.minhas }),
        React.createElement(Chip, { label: 'Não lidas', icone: 'mark_email_unread', titulo: 'Conversas com mensagens novas do cidadão', ativo: filtro === 'naolidas', onClick: () => setFiltro('naolidas'), badge: contagens.naolidas }),
        React.createElement(Chip, { label: 'Fila', icone: 'schedule', titulo: 'Aguardando triagem: ainda sem setor responsável', ativo: filtro === 'fila', onClick: () => setFiltro('fila'), badge: contagens.fila }),
        React.createElement('button', {
          type: 'button',
          onClick: () => setShowFiltros((v) => !v),
          'aria-expanded': showFiltros,
          'aria-controls': 'chatgov-filtros-adicionais',
          style: {
            minHeight: 38, padding: '7px 11px', borderRadius: 18, cursor: 'pointer',
            border: `1px solid ${filtroSecundarioAtivo ? T.primary : T.borderStrong}`,
            background: filtroSecundarioAtivo ? T.primarySoft : 'transparent',
            color: filtroSecundarioAtivo ? T.primary : T.textSecondary,
            fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4,
          },
        },
          'Mais filtros',
          React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 17 } }, showFiltros ? 'expand_less' : 'expand_more'),
        ),
      ),
      (showFiltros || filtroSecundarioAtivo) && React.createElement('div', {
        id: 'chatgov-filtros-adicionais',
        role: 'group',
        'aria-label': 'Filtros adicionais de conversas',
        style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` },
      },
        React.createElement(Chip, { label: 'Sem responsável', icone: 'person_off', titulo: 'Conversas abertas que ninguém assumiu', ativo: filtro === 'sem_responsavel', onClick: () => setFiltro('sem_responsavel'), badge: contagens.sem_responsavel }),
        React.createElement(Chip, { label: 'Atrasadas', icone: 'running_with_errors', titulo: `Cidadão esperando resposta há mais de ${HORAS_ATRASO} horas`, ativo: filtro === 'atrasadas', onClick: () => setFiltro('atrasadas'), badge: contagens.atrasadas }),
        React.createElement(Chip, { label: 'Com protocolo', icone: 'tag', titulo: 'Conversas com número de protocolo gerado', ativo: filtro === 'com_protocolo', onClick: () => setFiltro('com_protocolo'), badge: contagens.com_protocolo }),
        React.createElement(Chip, { label: 'Aguardando cidadão', icone: 'hourglass_empty', titulo: 'Respondemos e estamos no aguardo do cidadão', ativo: filtro === 'aguardando_cidadao', onClick: () => setFiltro('aguardando_cidadao'), badge: contagens.aguardando_cidadao }),
        React.createElement(Chip, { label: 'Aguardando setor', icone: 'apartment', titulo: 'Pendente de retorno do setor responsável', ativo: filtro === 'aguardando_setor', onClick: () => setFiltro('aguardando_setor'), badge: contagens.aguardando_setor }),
        React.createElement(Chip, { label: 'Resolvidas', icone: 'task_alt', titulo: 'Atendimentos finalizados', ativo: filtro === 'resolvidas', onClick: () => setFiltro('resolvidas'), badge: contagens.resolvidas }),
        React.createElement(Chip, { label: 'Arquivadas', icone: 'archive', titulo: 'Fora das listas principais', ativo: filtro === 'arquivadas', onClick: () => setFiltro('arquivadas'), badge: contagens.arquivadas }),
        departamentos.map((dep) =>
          React.createElement(Chip, {
            key: dep.id, label: dep.nome, ativo: filtro === dep.id, cor: dep.cor,
            onClick: () => setFiltro(filtro === dep.id ? 'todas' : dep.id),
          })),
      ),
    ),

    // List
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: `4px 8px ${ehMobile ? '80px' : '8px'}` } },
      ehAtend
        ? (carregando && conversas.length === 0
            ? React.createElement(SkeletonLista, null)
            : conversas.length === 0
            ? React.createElement(VazioLista, { texto: 'Inicie uma conversa para ver suas mensagens aqui.' })
            : conversasOrdenadas.map((c) => React.createElement(ItemConversa, {
                key: c.id, conversa: c, ativa: c.id === conversaAtivaId, opId: op?.id,
                fixada: fixadas.includes(c.id), onFixar: alternarFixada,
                onClick: () => {
                  if (c.nao_lidas > 0) {
                    setConversas((prev) => prev.map((conv) => conv.id === c.id ? { ...conv, nao_lidas: 0 } : conv));
                    socket.timeout(5000).emit('conversa:abrir', c.id, () => {});
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
              minHeight: 44, padding: '10px 12px', borderRadius: T.radius,
              border: `1px solid ${T.primary}`, cursor: 'pointer',
              background: T.surface, color: T.primary, fontSize: 14, fontWeight: 700,
            },
          }, React.createElement(MessageSquarePlus, { size: 18 }), 'Nova conversa')
        : React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', {
              onClick: () => setShowNovaDM(true),
              style: {
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: T.radius, border: 'none', cursor: 'pointer',
                background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              },
            }, React.createElement(Plus, { size: 16 }), 'Nova Mensagem'),
            React.createElement('button', {
              onClick: () => setShowNovoGrupo(true),
              style: {
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: T.radius, border: 'none', cursor: 'pointer',
                background: T.surfaceMuted, color: T.text, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              },
            }, React.createElement(Users, { size: 16 }), 'Novo grupo'),
          ),
    ),

    !ehMobile && !ehTablet && React.createElement('div', {
      role: 'separator',
      tabIndex: 0,
      'aria-label': 'Redimensionar lista de conversas',
      'aria-orientation': 'vertical',
      'aria-valuemin': 380,
      'aria-valuemax': 560,
      'aria-valuenow': larguraDesktop,
      title: 'Arraste para redimensionar a lista',
      onPointerDown: redimensionar,
      onKeyDown: (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          setLarguraDesktop((atual) => Math.min(560, Math.max(380, atual + (event.key === 'ArrowRight' ? 20 : -20))));
        }
      },
      style: {
        position: 'absolute', top: 0, right: -4, bottom: 0, width: 8,
        cursor: 'col-resize', zIndex: 50, outlineOffset: -2,
      },
    }),

    // Modals
    showNovaConversa && React.createElement(ModalNovaConversa, {
      departamentos,
      onClose: () => setShowNovaConversa(false),
      onCriada: (conv) => { setShowNovaConversa(false); carregarConversas(); if (conv?.id) onSelectConversa(conv); },
      // "Abrir atendimento existente" (aviso de duplicidade) precisa achar a
      // conversa na lista atual; se ainda não estiver carregada, recarrega.
      onAbrirConversa: (convId) => {
        const existente = conversas.find((c) => c.id === convId);
        if (existente) onSelectConversa(existente);
        else carregarConversas().then(() => onSelectConversa({ id: convId }));
      },
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
    style: { padding: '64px 24px', textAlign: 'center', color: T.textSecondary, fontSize: 13 },
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
