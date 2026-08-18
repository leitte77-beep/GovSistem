import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Search, X, ChevronLeft, ChevronRight,
  Clock, AlertCircle, MessageSquare, Paperclip, AlertTriangle, Lock,
  Loader2, CheckSquare, Square, User, Inbox,
  CheckCircle2, Plus, Eye, RefreshCw, Archive, RotateCcw,
} from 'lucide-react';
import { T } from '../theme';

var STATUS_BADGE = {
  ABERTO: { label: 'Aberto', cor: T.warning, bg: T.warningSoft },
  EM_TRIAGEM: { label: 'Em triagem', cor: '#3B82F6', bg: '#DBEAFE' },
  DISTRIBUIDO: { label: 'Distribuído', cor: '#7C3AED', bg: '#EDE9FE' },
  RECEBIDO: { label: 'Recebido', cor: '#0D9488', bg: '#CCFBF1' },
  EM_ANALISE: { label: 'Em análise', cor: T.primary, bg: T.primarySoft },
  AGUARDANDO_CIDADAO: { label: 'Aguardando cidadão', cor: '#F59E0B', bg: '#FEF3C7' },
  PENDENTE: { label: 'Pendente', cor: '#F59E0B', bg: '#FEF3C7' },
  CONCLUIDO: { label: 'Concluído', cor: T.success, bg: T.successSoft },
  CANCELADO: { label: 'Cancelado', cor: T.danger, bg: T.dangerSoft },
  ARQUIVADO: { label: 'Arquivado', cor: '#6B7280', bg: '#F3F4F6' },
};

var PRIORIDADE_COR = { BAIXA: T.success, NORMAL: T.textMuted, ALTA: T.warning, URGENTE: T.danger };
var PRIORIDADE_LABEL = { BAIXA: 'Baixa', NORMAL: 'Normal', ALTA: 'Alta', URGENTE: 'Urgente' };

var ORIGEM_LABEL = {
  whatsapp: 'WhatsApp', portal: 'Portal', presencial: 'Presencial',
  telefone: 'Telefone', email: 'E-mail', interno: 'Interno',
  app: 'App', api: 'API', assistente_virtual: 'Assistente',
};

var STATUS_OPTIONS = [
  '', 'ABERTO', 'EM_TRIAGEM', 'DISTRIBUIDO', 'RECEBIDO', 'EM_ANALISE',
  'AGUARDANDO_CIDADAO', 'PENDENTE', 'CONCLUIDO', 'CANCELADO', 'ARQUIVADO',
];

var TAMANHOS_PAGINA = [10, 20, 50, 100];

function formatarData(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatarDataCompleta(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mascararCPF(valor) {
  if (!valor) return '—';
  var s = String(valor).replace(/\D/g, '');
  if (s.length === 11) return s.slice(0, 3) + '.***.***-' + s.slice(9);
  if (s.length === 14) return s.slice(0, 2) + '.***.***/****-' + s.slice(10);
  return valor;
}

function prazoAtrasado(prazoEm, status) {
  if (!prazoEm || status === 'CONCLUIDO' || status === 'CANCELADO') return false;
  return new Date(prazoEm) < new Date();
}

function prazoProximo(prazoEm, status) {
  if (!prazoEm || status === 'CONCLUIDO' || status === 'CANCELADO') return false;
  var agora = new Date();
  var prazo = new Date(prazoEm);
  if (prazo <= agora) return false;
  var diffMs = prazo.getTime() - agora.getTime();
  var diffHoras = diffMs / (1000 * 60 * 60);
  return diffHoras <= 48;
}

function totalFiltrosAtivos(filtros, busca) {
  var n = 0;
  if (filtros.status) n++;
  if (filtros.prioridade) n++;
  if (filtros.origem) n++;
  if (filtros.atrasados) n++;
  if (filtros.proximos_prazo) n++;
  if (busca) n++;
  return n;
}

var DASH_CARDS = [
  { key: 'aguardando_triagem', label: 'Aguardando triagem', icon: Inbox, color: T.warning, filter: { status: 'EM_TRIAGEM' } },
  { key: 'em_andamento', label: 'Em andamento', icon: Clock, color: T.primary, filter: { status: 'EM_ANALISE' } },
  { key: 'aguardando_cidadao', label: 'Aguardando cidadão', icon: User, color: '#F59E0B', filter: { status: 'AGUARDANDO_CIDADAO' } },
  { key: 'proximos_prazo', label: 'Próximos do prazo', icon: AlertCircle, color: '#D97706', filter: { proximos_prazo: true } },
  { key: 'atrasados', label: 'Atrasados', icon: AlertTriangle, color: T.danger, filter: { atrasados: true } },
  { key: 'concluidos_periodo', label: 'Concluídos no período', icon: CheckCircle2, color: T.success, filter: { status: 'CONCLUIDO' } },
];

export function PaginaProtocolos({ breakpoint, onAbrirProtocolo, onCriarProtocolo, refreshKey }) {
  var ehMobile = breakpoint === 'mobile';
  var ehTablet = breakpoint === 'tablet';

  var [lista, setLista] = useState([]);
  var [total, setTotal] = useState(0);
  var [dashboard, setDashboard] = useState(null);
  var [carregando, setCarregando] = useState(true);
  var [erro, setErro] = useState('');
  var [pagina, setPagina] = useState(0);
  var [tamanhoPagina, setTamanhoPagina] = useState(10);
  var [filtros, setFiltros] = useState({ status: '', prioridade: '', origem: '', atrasados: false, proximos_prazo: false });
  var [busca, setBusca] = useState('');
  var [buscaTemp, setBuscaTemp] = useState('');
  var [activeCard, setActiveCard] = useState(null);
  var [selecionados, setSelecionados] = useState([]);
  var [processandoIds, setProcessandoIds] = useState([]);
  var [feedback, setFeedback] = useState(null);

  var carregar = useCallback(async function () {
    setCarregando(true);
    setErro('');
    try {
      var authRaw = localStorage.getItem('chatgov_auth');
      var token = '';
      try { token = JSON.parse(authRaw || '{}').token || ''; } catch (e) { token = ''; }

      var params = new URLSearchParams();
      if (filtros.status) params.set('status', filtros.status);
      if (filtros.prioridade) params.set('prioridade', filtros.prioridade);
      if (filtros.origem) params.set('origem', filtros.origem);
      if (filtros.atrasados) params.set('atrasados', 'true');
      if (filtros.proximos_prazo) params.set('proximos_prazo', 'true');
      if (busca) params.set('busca', busca);
      params.set('limite', String(tamanhoPagina));
      params.set('offset', String(pagina * tamanhoPagina));

      var headers = token ? { Authorization: 'Bearer ' + token, Accept: 'application/json' } : { Accept: 'application/json' };

      var [respLista, respDash] = await Promise.all([
        fetch('/api/v1/protocols?' + params.toString(), { headers: headers }).then(function (r) {
          if (!r.ok) throw new Error('Erro ' + r.status + ' ao carregar protocolos');
          return r.json();
        }),
        fetch('/api/v1/protocols/dashboard', { headers: headers }).then(function (r) {
          if (!r.ok) return null;
          return r.json();
        }).catch(function () { return null; }),
      ]);

      var dados = respLista;
      if (Array.isArray(dados)) {
        // Formato legado (array puro, sem total): não há como saber o total
        // real, então paginamos só com o que veio.
        setLista(dados);
        setTotal(pagina * tamanhoPagina + dados.length);
      } else if (dados && Array.isArray(dados.data)) {
        setLista(dados.data);
        setTotal(dados.total || dados.data.length);
      } else if (dados && Array.isArray(dados.protocolos)) {
        setLista(dados.protocolos);
        setTotal(dados.total || dados.protocolos.length);
      } else {
        setLista([]);
        setTotal(0);
      }
      setDashboard(respDash);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar protocolos');
      setLista([]);
      setTotal(0);
    } finally {
      setCarregando(false);
    }
  }, [filtros.status, filtros.prioridade, filtros.origem, filtros.atrasados, filtros.proximos_prazo, busca, pagina, tamanhoPagina, refreshKey]);

  useEffect(function () { carregar(); }, [carregar]);

  useEffect(function () {
    setSelecionados([]);
  }, [pagina, tamanhoPagina, filtros.status, filtros.prioridade, filtros.origem, filtros.atrasados, filtros.proximos_prazo, busca]);

  var totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));
  var inicioExibindo = total === 0 ? 0 : pagina * tamanhoPagina + 1;
  var fimExibindo = Math.min((pagina + 1) * tamanhoPagina, total);

  var handleCardClick = useCallback(function (cardKey) {
    setPagina(0);
    if (activeCard === cardKey) {
      setActiveCard(null);
      setFiltros({ status: '', prioridade: '', origem: '', atrasados: false, proximos_prazo: false });
      return;
    }
    setActiveCard(cardKey);
    var cardDef = DASH_CARDS.find(function (c) { return c.key === cardKey; });
    if (cardDef && cardDef.filter) {
      var f = cardDef.filter;
      setFiltros({
        status: f.status || '',
        prioridade: f.prioridade || '',
        origem: f.origem || '',
        atrasados: !!f.atrasados,
        proximos_prazo: !!f.proximos_prazo,
      });
    }
  }, [activeCard]);

  var handleLimparFiltros = useCallback(function () {
    setFiltros({ status: '', prioridade: '', origem: '', atrasados: false, proximos_prazo: false });
    setBusca('');
    setBuscaTemp('');
    setActiveCard(null);
    setPagina(0);
  }, []);

  var handleBuscaSubmit = useCallback(function (e) {
    e.preventDefault();
    setBusca(buscaTemp);
    setPagina(0);
  }, [buscaTemp]);

  var handleStatusChange = useCallback(function (e) {
    setFiltros(function (f) { return Object.assign({}, f, { status: e.target.value }); });
    setActiveCard(null);
    setPagina(0);
  }, []);

  var handlePrioridadeChange = useCallback(function (e) {
    setFiltros(function (f) { return Object.assign({}, f, { prioridade: e.target.value }); });
    setActiveCard(null);
    setPagina(0);
  }, []);

  var handleOrigemChange = useCallback(function (e) {
    setFiltros(function (f) { return Object.assign({}, f, { origem: e.target.value }); });
    setActiveCard(null);
    setPagina(0);
  }, []);

  var handleAtrasadosToggle = useCallback(function () {
    setFiltros(function (f) { return Object.assign({}, f, { atrasados: !f.atrasados }); });
    setActiveCard(null);
    setPagina(0);
  }, []);

  var handleTamanhoPagina = useCallback(function (e) {
    setTamanhoPagina(Number(e.target.value));
    setPagina(0);
  }, []);

  var nFiltros = totalFiltrosAtivos(filtros, busca);

  function getAuthHeaders() {
    var token = '';
    try { token = JSON.parse(localStorage.getItem('chatgov_auth') || '{}').token || ''; } catch (e) {}
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  }

  async function chamarAcaoProtocolo(p, acao, motivo) {
    var caminhos = { concluir: 'complete', arquivar: 'archive', reabrir: 'reopen' };
    var resposta = await fetch('/api/v1/protocols/' + p.id + '/' + caminhos[acao], {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(motivo ? { justificativa: motivo } : {}),
    });
    var dados = await resposta.json().catch(function () { return {}; });
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível atualizar o protocolo.');
    return dados;
  }

  async function executarAcaoIndividual(p, acao) {
    var motivo = '';
    if (acao === 'reabrir') {
      motivo = window.prompt('Informe o motivo da reabertura:') || '';
      if (!motivo.trim()) return;
    } else {
      var verbo = acao === 'arquivar' ? 'arquivar' : 'concluir';
      if (!window.confirm('Deseja ' + verbo + ' o protocolo ' + (p.numero || '') + '?')) return;
    }

    setProcessandoIds(function (ids) { return ids.concat([p.id]); });
    setFeedback(null);
    try {
      await chamarAcaoProtocolo(p, acao, motivo.trim());
      setFeedback({ tipo: 'sucesso', texto: acao === 'reabrir' ? 'Protocolo reaberto.' : acao === 'arquivar' ? 'Protocolo arquivado.' : 'Protocolo concluído.' });
      await carregar();
    } catch (e) {
      setFeedback({ tipo: 'erro', texto: e.message });
    } finally {
      setProcessandoIds(function (ids) { return ids.filter(function (id) { return id !== p.id; }); });
    }
  }

  function alternarSelecao(id) {
    setSelecionados(function (ids) {
      return ids.includes(id) ? ids.filter(function (item) { return item !== id; }) : ids.concat([id]);
    });
  }

  function alternarTodos() {
    var idsPagina = lista.map(function (p) { return p.id; }).filter(Boolean);
    var todosMarcados = idsPagina.length > 0 && idsPagina.every(function (id) { return selecionados.includes(id); });
    setSelecionados(todosMarcados ? [] : idsPagina);
  }

  function elegiveisPara(acao) {
    return lista.filter(function (p) {
      if (!selecionados.includes(p.id)) return false;
      if (acao === 'arquivar') return ['CONCLUIDO', 'CANCELADO'].includes(p.status_operacional);
      if (acao === 'reabrir') return ['CONCLUIDO', 'CANCELADO', 'ARQUIVADO'].includes(p.status_operacional);
      return !['CONCLUIDO', 'CANCELADO', 'ARQUIVADO'].includes(p.status_operacional);
    });
  }

  async function executarAcaoEmMassa(acao) {
    var protocolos = elegiveisPara(acao);
    if (protocolos.length === 0) return;
    var motivo = '';
    if (acao === 'reabrir') {
      motivo = window.prompt('Informe o motivo da reabertura dos protocolos selecionados:') || '';
      if (!motivo.trim()) return;
    } else {
      var verbo = acao === 'arquivar' ? 'arquivar' : 'concluir';
      if (!window.confirm('Deseja ' + verbo + ' ' + protocolos.length + ' protocolo(s)?')) return;
    }

    var ids = protocolos.map(function (p) { return p.id; });
    setProcessandoIds(ids);
    setFeedback(null);
    try {
      await Promise.all(protocolos.map(function (p) { return chamarAcaoProtocolo(p, acao, motivo.trim()); }));
      setFeedback({ tipo: 'sucesso', texto: protocolos.length + ' protocolo(s) atualizado(s).' });
      setSelecionados([]);
      await carregar();
    } catch (e) {
      setFeedback({ tipo: 'erro', texto: e.message });
      await carregar();
    } finally {
      setProcessandoIds([]);
    }
  }

  var dashValues = dashboard && dashboard.totais ? dashboard.totais : (dashboard || {});

  var inputBase = {
    padding: '7px 10px',
    borderRadius: T.radiusSm,
    border: '1px solid ' + T.borderStrong,
    fontSize: 12.5,
    color: T.text,
    background: T.surface,
    outline: 'none',
    fontFamily: T.font,
    boxSizing: 'border-box',
  };

  var btnBase = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '7px 12px',
    borderRadius: T.radiusSm,
    border: '1px solid ' + T.borderStrong,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    background: T.surface,
    color: T.textSecondary,
    fontFamily: T.font,
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  };

  var thStyle = {
    padding: '8px 10px',
    fontSize: 11,
    fontWeight: 700,
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'left',
    borderBottom: '1px solid ' + T.borderStrong,
    background: T.surfaceAlt,
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  };

  var tdStyle = {
    padding: '10px',
    fontSize: 13,
    color: T.text,
    borderBottom: '1px solid ' + T.border,
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  };

  function colunasVisiveis() {
    if (ehMobile) return ['checkbox', 'numero', 'solicitante', 'status', 'prazo', 'acoes'];
    if (ehTablet) return ['checkbox', 'numero', 'solicitante', 'cpf', 'servico', 'setor', 'status', 'prioridade', 'prazo', 'acoes'];
    return ['checkbox', 'numero', 'solicitante', 'cpf', 'servico', 'setor', 'responsavel', 'status', 'prioridade', 'prazo', 'origem', 'acoes'];
  }

  function renderCabecalhoColuna(col) {
    var mapa = {
      checkbox: React.createElement('button', {
        type: 'button', onClick: alternarTodos, title: 'Selecionar protocolos desta página', 'aria-label': 'Selecionar protocolos desta página',
        style: { width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', color: T.textMuted, cursor: 'pointer' },
      }, React.createElement(lista.length > 0 && lista.every(function (p) { return selecionados.includes(p.id); }) ? CheckSquare : Square, { size: 17 })),
      numero: 'Nº',
      solicitante: 'Solicitante',
      cpf: 'CPF/CNPJ',
      servico: 'Serviço',
      setor: 'Setor',
      responsavel: 'Responsável',
      status: 'Status',
      prioridade: 'Prior.',
      prazo: 'Prazo',
      origem: 'Origem',
      acoes: React.createElement('span', { style: { textAlign: 'center', display: 'block' } }, 'Ações'),
    };
    var colWidths = { checkbox: 34, numero: 175, prioridade: 48, prazo: 70, origem: 80 };
    var extra = Object.assign({}, col === 'acoes' ? { textAlign: 'center', width: ehMobile ? 112 : 150 } : {});
    if (colWidths[col]) extra.width = colWidths[col];
    return React.createElement('th', { key: col, style: Object.assign({}, thStyle, extra) }, mapa[col]);
  }

  function renderCelulaProtocolo(p, col, isSelected) {
    var rowBg = isSelected ? T.primarySoft : 'transparent';

    if (col === 'checkbox') {
      return React.createElement('td', { key: col, style: { padding: '0 4px', width: 34, background: rowBg, verticalAlign: 'middle', borderBottom: '1px solid ' + T.border } },
        React.createElement('button', {
          type: 'button', onClick: function (ev) { ev.stopPropagation(); alternarSelecao(p.id); },
          title: isSelected ? 'Remover da seleção' : 'Selecionar protocolo',
          'aria-label': isSelected ? 'Remover protocolo da seleção' : 'Selecionar protocolo',
          style: { width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', color: isSelected ? T.primary : T.textMuted, cursor: 'pointer' },
        }, React.createElement(isSelected ? CheckSquare : Square, { size: 17 })),
      );
    }

    if (col === 'numero') {
      var indicadores = [];
      if (prazoAtrasado(p.prazo_em, p.status_operacional)) {
        indicadores.push(React.createElement('span', { key: 'red', style: { width: 7, height: 7, borderRadius: '50%', background: T.danger, display: 'inline-block', flexShrink: 0 } }));
      } else if (prazoProximo(p.prazo_em, p.status_operacional)) {
        indicadores.push(React.createElement('span', { key: 'orange', style: { width: 7, height: 7, borderRadius: '50%', background: T.warning, display: 'inline-block', flexShrink: 0 } }));
      }
      if (p.msgs_nao_lidas > 0) {
        indicadores.push(React.createElement(MessageSquare, { key: 'msg', size: 13, style: { color: T.primary, flexShrink: 0 } }));
        indicadores.push(React.createElement('span', {
          key: 'msg-badge',
          style: { fontSize: 10, fontWeight: 700, color: '#fff', background: T.primary, padding: '0px 4.5px', borderRadius: 999, lineHeight: '15px', flexShrink: 0, minWidth: 15, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
        }, p.msgs_nao_lidas));
      }
      if (p.docs_novos > 0) {
        indicadores.push(React.createElement(Paperclip, { key: 'doc', size: 13, style: { color: T.textMuted, flexShrink: 0 } }));
      }
      if (p.pendencias_abertas > 0) {
        indicadores.push(React.createElement(AlertTriangle, { key: 'pend', size: 13, style: { color: T.warning, flexShrink: 0 } }));
      }
      if (p.nivel_acesso === 'restrito' || p.nivel_acesso === 'sigiloso') {
        indicadores.push(React.createElement(Lock, { key: 'lock', size: 12, style: { color: T.danger, flexShrink: 0 } }));
      }
      if (p.origem === 'whatsapp') {
        indicadores.push(React.createElement(MessageSquare, { key: 'wa', size: 13, style: { color: T.whatsappGreen, flexShrink: 0 } }));
      }
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg, overflow: 'hidden' }) },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
          React.createElement('span', { style: { fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13 } }, p.numero || '—'),
          indicadores.length > 0 && React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: 3 } }, indicadores),
        ),
      );
    }

    if (col === 'solicitante') {
      // O nome vem do cidadão (protocolo externo) ou do contato do WhatsApp.
      // Protocolo interno não tem solicitante externo — dizemos isso em vez
      // de exibir um traço solto.
      var nomeSolicitante = p.solicitante_nome || p.cidadao_nome || p.contato_nome || null;
      var ehInterno = p.externo === false;
      var conteudoSolicitante = nomeSolicitante
        ? nomeSolicitante
        : React.createElement('span', { style: { color: T.textMuted, fontStyle: 'italic' } },
            ehInterno ? (p.departamento_nome || 'Protocolo interno') : 'Sem solicitante');

      return React.createElement('td', {
        key: col,
        title: nomeSolicitante || (ehInterno ? 'Protocolo interno' : 'Protocolo externo sem solicitante vinculado'),
        style: Object.assign({}, tdStyle, { background: rowBg, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }),
      }, conteudoSolicitante);
    }

    if (col === 'cpf') {
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg, fontVariantNumeric: 'tabular-nums' }) },
        mascararCPF(p.solicitante_documento || p.cidadao_cpf || p.cidadao_cnpj || p.contato_cpf),
      );
    }

    if (col === 'servico') {
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }) },
        p.servico_nome || '—',
      );
    }

    if (col === 'setor') {
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }) },
        p.setor_atual_nome || '—',
      );
    }

    if (col === 'responsavel') {
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg }) },
        p.responsavel_nome || '—',
      );
    }

    if (col === 'status') {
      var badge = STATUS_BADGE[p.status_operacional] || { label: p.status_operacional || '—', cor: T.textMuted, bg: T.surfaceMuted };
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg }) },
        React.createElement('span', {
          style: { display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: badge.cor, background: badge.bg, whiteSpace: 'nowrap' },
        }, badge.label),
      );
    }

    if (col === 'prioridade') {
      var cor = PRIORIDADE_COR[p.prioridade] || T.textMuted;
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg }) },
        React.createElement('span', { style: { fontSize: 11.5, fontWeight: 700, color: cor } }, PRIORIDADE_LABEL[p.prioridade] || p.prioridade || '—'),
      );
    }

    if (col === 'prazo') {
      var atrasado = prazoAtrasado(p.prazo_em, p.status_operacional);
      var proximo = prazoProximo(p.prazo_em, p.status_operacional);
      var prazoColor = atrasado ? T.danger : proximo ? T.warning : T.text;
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg }) },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          atrasado && React.createElement(AlertCircle, { size: 13, style: { color: T.danger } }),
          React.createElement('span', { style: { fontSize: 12.5, fontWeight: atrasado ? 700 : 500, color: prazoColor } }, formatarData(p.prazo_em)),
        ),
      );
    }

    if (col === 'origem') {
      var origemLabel = ORIGEM_LABEL[p.origem] || p.origem || '—';
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg }) },
        React.createElement('span', {
          style: { fontSize: 11, color: T.textMuted, background: T.surfaceMuted, padding: '2px 7px', borderRadius: 4, fontWeight: 600 },
        }, origemLabel),
      );
    }

    if (col === 'acoes') {
      var statusTerminal = ['CONCLUIDO', 'CANCELADO', 'ARQUIVADO'].includes(p.status_operacional);
      var estaProcessando = processandoIds.includes(p.id);
      return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg, textAlign: 'center', width: ehMobile ? 112 : 150 }) },
        React.createElement('div', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 } },
          React.createElement('button', {
            onClick: function (ev) { ev.stopPropagation(); onAbrirProtocolo && onAbrirProtocolo(p); },
            title: 'Abrir protocolo',
            'aria-label': 'Abrir protocolo',
            style: Object.assign({}, btnBase, { padding: '4px 9px', color: T.primary, fontSize: 11.5 }),
          }, React.createElement(Eye, { size: 14 }), !ehMobile && 'Abrir'),
          !statusTerminal && React.createElement('button', {
            onClick: function (ev) { ev.stopPropagation(); executarAcaoIndividual(p, 'concluir'); },
            disabled: estaProcessando, title: 'Concluir protocolo',
            'aria-label': 'Concluir protocolo',
            style: Object.assign({}, btnBase, { padding: '5px 7px', color: T.success, background: T.successSoft, borderColor: T.success + '55', opacity: estaProcessando ? 0.55 : 1 }),
          }, React.createElement(CheckCircle2, { size: 14 })),
          ['CONCLUIDO', 'CANCELADO'].includes(p.status_operacional) && React.createElement('button', {
            onClick: function (ev) { ev.stopPropagation(); executarAcaoIndividual(p, 'arquivar'); },
            disabled: estaProcessando, title: 'Arquivar protocolo',
            'aria-label': 'Arquivar protocolo',
            style: Object.assign({}, btnBase, { padding: '5px 7px', color: T.textSecondary, background: T.surfaceAlt, opacity: estaProcessando ? 0.55 : 1 }),
          }, React.createElement(Archive, { size: 14 })),
          statusTerminal && React.createElement('button', {
            onClick: function (ev) { ev.stopPropagation(); executarAcaoIndividual(p, 'reabrir'); },
            disabled: estaProcessando, title: 'Reabrir protocolo',
            'aria-label': 'Reabrir protocolo',
            style: Object.assign({}, btnBase, { padding: '5px 7px', color: T.primaryOnSoft, background: T.primarySoft, borderColor: T.primary + '55', opacity: estaProcessando ? 0.55 : 1 }),
          }, React.createElement(RotateCcw, { size: 14 })),
        ),
      );
    }

    return React.createElement('td', { key: col, style: Object.assign({}, tdStyle, { background: rowBg }) }, '');
  }

  var colunas = colunasVisiveis();

  return React.createElement('div', {
    style: { flex: 1, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', background: T.bg },
  },
    // ── CABEÇALHO ──
    React.createElement('div', {
      style: { padding: ehMobile ? '12px 14px' : '16px 20px', borderBottom: '1px solid ' + T.border, background: T.surface, flexShrink: 0 },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 } },
        React.createElement(FileText, { size: 22, style: { color: T.primary } }),
        React.createElement('h2', { style: { fontSize: 20, fontWeight: 700, color: T.text, margin: 0, flex: 1 } }, 'Protocolos'),
        onCriarProtocolo && React.createElement('button', {
          onClick: onCriarProtocolo,
          'aria-label': 'Novo protocolo',
          style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font },
        },
          React.createElement(Plus, { size: 16 }),
          !ehMobile && 'Novo protocolo',
        ),
      ),
      // Dashboard cards
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(DASH_CARDS.length, ehMobile ? 3 : 6) + ', 1fr)', gap: 8 },
      },
        DASH_CARDS.map(function (c) {
          var isActive = activeCard === c.key;
          var valor = dashValues[c.key] !== undefined ? dashValues[c.key] : (dashValues[c.key.replace(/_/g, '')] !== undefined ? dashValues[c.key.replace(/_/g, '')] : 0);
          return React.createElement('div', {
            key: c.key,
            onClick: function () { handleCardClick(c.key); },
            style: {
              padding: '10px 12px',
              borderRadius: T.radius,
              cursor: 'pointer',
              background: isActive ? T.primarySoft : T.surfaceAlt,
              border: '1px solid ' + (isActive ? T.primary : T.border),
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              transition: 'border-color 0.15s, background 0.15s',
              minWidth: 0,
            },
          },
            React.createElement(c.icon, { size: 16, style: { color: c.color } }),
            React.createElement('span', { style: { fontSize: 18, fontWeight: 800, color: T.text, lineHeight: 1 } }, valor),
            React.createElement('span', { style: { fontSize: 10.5, color: T.textMuted, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 } }, c.label),
          );
        }),
      ),
    ),

    // ── FILTROS ──
    React.createElement('div', {
      style: { padding: ehMobile ? '8px 14px' : '8px 20px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid ' + T.border, background: T.surface, flexShrink: 0 },
    },
      React.createElement('form', {
        onSubmit: handleBuscaSubmit,
        style: { position: 'relative', flex: '1 1 200px', minWidth: 160 },
      },
        React.createElement(Search, { size: 14, style: { position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, zIndex: 1 } }),
        React.createElement('input', {
          value: buscaTemp,
          onChange: function (e) { setBuscaTemp(e.target.value); },
          placeholder: 'Buscar por nº, nome, CPF, assunto...',
          style: Object.assign({}, inputBase, { width: '100%', paddingLeft: 28 }),
        }),
        buscaTemp && React.createElement('button', {
          type: 'button',
          onClick: function () { setBuscaTemp(''); setBusca(''); setPagina(0); },
          'aria-label': 'Limpar busca',
          style: { position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: T.textMuted, display: 'flex' },
        }, React.createElement(X, { size: 14 })),
      ),

      React.createElement('select', { value: filtros.status, onChange: handleStatusChange, style: Object.assign({}, inputBase, { maxWidth: 150 }) },
        React.createElement('option', { value: '' }, 'Todos os status'),
        STATUS_OPTIONS.filter(Boolean).map(function (s) {
          var label = STATUS_BADGE[s] ? STATUS_BADGE[s].label : s;
          return React.createElement('option', { key: s, value: s }, label);
        }),
      ),

      React.createElement('select', { value: filtros.prioridade, onChange: handlePrioridadeChange, style: Object.assign({}, inputBase, { maxWidth: 115 }) },
        React.createElement('option', { value: '' }, 'Prioridade'),
        React.createElement('option', { value: 'BAIXA' }, 'Baixa'),
        React.createElement('option', { value: 'NORMAL' }, 'Normal'),
        React.createElement('option', { value: 'ALTA' }, 'Alta'),
        React.createElement('option', { value: 'URGENTE' }, 'Urgente'),
      ),

      React.createElement('select', { value: filtros.origem, onChange: handleOrigemChange, style: Object.assign({}, inputBase, { maxWidth: 130 }) },
        React.createElement('option', { value: '' }, 'Origem'),
        Object.keys(ORIGEM_LABEL).map(function (k) { return React.createElement('option', { key: k, value: k }, ORIGEM_LABEL[k]); }),
      ),

      React.createElement('button', {
        onClick: handleAtrasadosToggle,
        style: Object.assign({}, btnBase, {
          background: filtros.atrasados ? T.dangerSoft : T.surface,
          color: filtros.atrasados ? T.danger : T.textSecondary,
          borderColor: filtros.atrasados ? T.danger : T.borderStrong,
          fontWeight: 700,
        }),
      }, 'Atrasados'),

      nFiltros > 0 && React.createElement('button', {
        onClick: handleLimparFiltros,
        style: Object.assign({}, btnBase, { color: T.danger, borderColor: T.danger, gap: 4 }),
      },
        React.createElement(X, { size: 13 }),
        'Limpar' + (nFiltros > 0 ? ' (' + nFiltros + ')' : ''),
      ),
    ),

    // ── PAGINAÇÃO (topo) ──
    React.createElement('div', {
      style: { padding: ehMobile ? '6px 14px' : '8px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid ' + T.border, background: T.surface, flexShrink: 0, fontSize: 12.5, color: T.textMuted },
    },
      React.createElement('span', null, 'Mostrando ' + inicioExibindo + '-' + fimExibindo + ' de ' + total + ' protocolos'),
      React.createElement('span', { style: { marginLeft: 'auto' } }),
      React.createElement('select', { value: String(tamanhoPagina), onChange: handleTamanhoPagina, style: Object.assign({}, inputBase, { fontSize: 11.5, padding: '4px 6px' }) },
        TAMANHOS_PAGINA.map(function (n) { return React.createElement('option', { key: n, value: String(n) }, n + ' por página'); }),
      ),
      React.createElement('button', {
        onClick: function () { if (pagina > 0) setPagina(pagina - 1); },
        disabled: pagina === 0,
        'aria-label': 'Página anterior',
        style: Object.assign({}, btnBase, { padding: '4px 8px', opacity: pagina === 0 ? 0.4 : 1, cursor: pagina === 0 ? 'default' : 'pointer' }),
      }, React.createElement(ChevronLeft, { size: 15 })),
      React.createElement('button', {
        onClick: function () { if (pagina < totalPaginas - 1) setPagina(pagina + 1); },
        disabled: pagina >= totalPaginas - 1,
        'aria-label': 'Próxima página',
        'aria-label': 'Próxima página',
        style: Object.assign({}, btnBase, { padding: '4px 8px', opacity: pagina >= totalPaginas - 1 ? 0.4 : 1, cursor: pagina >= totalPaginas - 1 ? 'default' : 'pointer' }),
      }, React.createElement(ChevronRight, { size: 15 })),
    ),

    feedback && React.createElement('div', {
      role: feedback.tipo === 'erro' ? 'alert' : 'status',
      style: {
        padding: '9px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid ' + (feedback.tipo === 'erro' ? T.danger : T.success),
        background: feedback.tipo === 'erro' ? T.dangerSoft : T.successSoft,
        color: feedback.tipo === 'erro' ? T.danger : T.success, fontSize: 12.5, fontWeight: 600,
      },
    },
      React.createElement(feedback.tipo === 'erro' ? AlertCircle : CheckCircle2, { size: 15 }),
      React.createElement('span', { style: { flex: 1 } }, feedback.texto),
      React.createElement('button', {
        onClick: function () { setFeedback(null); }, title: 'Fechar aviso', 'aria-label': 'Fechar aviso',
        style: { border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 2, display: 'flex' },
      }, React.createElement(X, { size: 14 })),
    ),

    selecionados.length > 0 && React.createElement('div', {
      style: {
        padding: ehMobile ? '10px 14px' : '10px 20px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        background: T.primarySoft, borderBottom: '1px solid ' + T.primary + '33',
      },
    },
      React.createElement('strong', { style: { color: T.primary, fontSize: 12.5, marginRight: 4 } }, selecionados.length + ' selecionado(s)'),
      elegiveisPara('concluir').length > 0 && React.createElement('button', {
        onClick: function () { executarAcaoEmMassa('concluir'); }, disabled: processandoIds.length > 0,
        style: Object.assign({}, btnBase, { padding: '6px 10px', color: T.success, background: T.surface, borderColor: T.success + '55' }),
      }, React.createElement(CheckCircle2, { size: 14 }), 'Concluir (' + elegiveisPara('concluir').length + ')'),
      elegiveisPara('arquivar').length > 0 && React.createElement('button', {
        onClick: function () { executarAcaoEmMassa('arquivar'); }, disabled: processandoIds.length > 0,
        style: Object.assign({}, btnBase, { padding: '6px 10px', color: T.textSecondary, background: T.surface }),
      }, React.createElement(Archive, { size: 14 }), 'Arquivar (' + elegiveisPara('arquivar').length + ')'),
      elegiveisPara('reabrir').length > 0 && React.createElement('button', {
        onClick: function () { executarAcaoEmMassa('reabrir'); }, disabled: processandoIds.length > 0,
        style: Object.assign({}, btnBase, { padding: '6px 10px', color: T.primary, background: T.surface, borderColor: T.primary + '55' }),
      }, React.createElement(RotateCcw, { size: 14 }), 'Reabrir (' + elegiveisPara('reabrir').length + ')'),
      React.createElement('button', {
        onClick: function () { setSelecionados([]); },
        style: Object.assign({}, btnBase, { marginLeft: 'auto', padding: '6px 10px', background: 'transparent', borderColor: 'transparent' }),
      }, React.createElement(X, { size: 14 }), 'Limpar seleção'),
    ),

    // ── CONTEÚDO PRINCIPAL ──
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 } },
      erro && React.createElement('div', {
        style: { margin: 16, padding: '14px 18px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 },
      },
        React.createElement(AlertCircle, { size: 18 }),
        React.createElement('span', { style: { flex: 1 } }, erro),
        React.createElement('button', {
          onClick: function () { carregar(); },
          style: { display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: T.danger, color: '#fff', border: 'none', borderRadius: T.radiusSm, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font },
        },
          React.createElement(RefreshCw, { size: 13 }),
          'Tentar novamente',
        ),
      ),

      carregando && lista.length === 0
        ? React.createElement('div', { style: { padding: 40 } },
            [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) {
              return React.createElement('div', {
                key: i,
                style: {
                  height: 56,
                  margin: '0 16px 8px',
                  borderRadius: T.radiusSm,
                  background: T.surface,
                  opacity: 1 - i * 0.1,
                  animation: 'none',
                },
              });
            }),
          )
        : lista.length === 0 && !carregando
        ? React.createElement('div', {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
          },
            React.createElement(FileText, { size: 48, style: { color: T.borderStrong } }),
            React.createElement('div', { style: { fontSize: 16, fontWeight: 600, color: T.text } }, 'Nenhum protocolo encontrado'),
            React.createElement('div', { style: { fontSize: 13, color: T.textMuted, textAlign: 'center', maxWidth: 360 } },
              'Não há protocolos que correspondam aos filtros atuais. Tente ajustar os critérios de busca ou criar um novo protocolo.',
            ),
            onCriarProtocolo && React.createElement('button', {
              onClick: onCriarProtocolo,
              style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, marginTop: 4 },
            },
              React.createElement(Plus, { size: 16 }),
              'Novo protocolo',
            ),
          )
        : React.createElement('table', {
            style: {
              width: '100%',
              minWidth: ehMobile ? 820 : ehTablet ? 1120 : 1420,
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
            },
          },
            React.createElement('thead', null,
              React.createElement('tr', null,
                colunas.map(function (col) { return renderCabecalhoColuna(col); }),
              ),
            ),
            React.createElement('tbody', null,
              lista.map(function (p) {
                var isSelected = selecionados.includes(p.id);
                var tmN = p.msgs_nao_lidas > 0;
                return React.createElement('tr', {
                  key: p.id || p.numero,
                  onClick: function () { onAbrirProtocolo && onAbrirProtocolo(p); },
                  style: {
                    cursor: 'pointer',
                    transition: 'background 0.1s, box-shadow 0.15s',
                    background: isSelected ? T.primarySoft : 'transparent',
                    boxShadow: tmN ? 'inset 3px 0 0 ' + T.primary : 'none',
                  },
                  onMouseEnter: function (e) { if (!isSelected) e.currentTarget.style.background = T.surfaceAlt; },
                  onMouseLeave: function (e) { if (!isSelected) e.currentTarget.style.background = 'transparent'; },
                },
                  colunas.map(function (col) { return renderCelulaProtocolo(p, col, isSelected); }),
                );
              }),
            ),
          ),
    ),

    // ── PAGINAÇÃO (rodapé) ──
    lista.length > 0 && React.createElement('div', {
      style: { padding: ehMobile ? '6px 14px' : '8px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid ' + T.border, background: T.surface, flexShrink: 0, fontSize: 12.5, color: T.textMuted },
    },
      React.createElement('span', null, 'Página ' + (pagina + 1) + ' de ' + totalPaginas),
      React.createElement('span', { style: { marginLeft: 'auto' } }),
      React.createElement('button', {
        onClick: function () { if (pagina > 0) setPagina(pagina - 1); },
        disabled: pagina === 0,
        'aria-label': 'Página anterior',
        style: Object.assign({}, btnBase, { padding: '4px 10px', opacity: pagina === 0 ? 0.4 : 1, cursor: pagina === 0 ? 'default' : 'pointer' }),
      },
        React.createElement(ChevronLeft, { size: 15 }),
        ehMobile ? null : 'Anterior',
      ),
      React.createElement('span', { style: { fontSize: 12, color: T.text } }, pagina + 1 + ' / ' + totalPaginas),
      React.createElement('button', {
        onClick: function () { if (pagina < totalPaginas - 1) setPagina(pagina + 1); },
        disabled: pagina >= totalPaginas - 1,
        style: Object.assign({}, btnBase, { padding: '4px 10px', opacity: pagina >= totalPaginas - 1 ? 0.4 : 1, cursor: pagina >= totalPaginas - 1 ? 'default' : 'pointer' }),
      },
        ehMobile ? null : 'Próximo',
        React.createElement(ChevronRight, { size: 15 }),
      ),
    ),
  );
}
