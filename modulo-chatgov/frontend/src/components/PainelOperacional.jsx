import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock, Calendar, Search, MessageSquarePlus,
  LayoutTemplate, Lock, AlertTriangle, CheckCircle2, TrendingUp,
  Users, MessageCircle, EyeOff, Eye, FileText, Archive,
} from 'lucide-react';
import { T } from '../theme';
import { fetchOperacional } from '../api';
import { Avatar } from './Avatar';
import { DeptBadge } from './DeptBadge';

// ===== Configuração centralizada =====
const CONFIG = {
  SLA_LIMITE: 5,
  SLA_VERDE_ATE_SEG: 300,
  SLA_AMARELO_APOS_SEG: 1800,
  SLA_ABANDONO_SEG: 7 * 24 * 3600,
  POLLING_INTERVAL_MS: 60000,
  SAUDACAO: {
    manha: { inicio: 5, fim: 11, texto: 'Bom dia' },
    tarde: { inicio: 12, fim: 17, texto: 'Boa tarde' },
    noite: { inicio: 18, fim: 4, texto: 'Boa noite' },
  },
};

function getSaudacao(hora) {
  const h = hora.getHours();
  if (h >= CONFIG.SAUDACAO.manha.inicio && h <= CONFIG.SAUDACAO.manha.fim) return CONFIG.SAUDACAO.manha.texto;
  if (h >= CONFIG.SAUDACAO.tarde.inicio && h <= CONFIG.SAUDACAO.tarde.fim) return CONFIG.SAUDACAO.tarde.texto;
  return CONFIG.SAUDACAO.noite.texto;
}

export { getSaudacao, getPrimeiroNome, formataTempo, formataEsperaCurta, formataDataExtenso };

function getPrimeiroNome(nome) {
  if (!nome) return '';
  return nome.trim().split(' ')[0];
}

function formataDataExtenso(data) {
  const diaSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${diaSemana[data.getDay()]}, ${data.getDate()} de ${meses[data.getMonth()]} de ${data.getFullYear()}`;
}

function formataTempo(segundos) {
  if (!segundos || segundos <= 0) return '—';
  if (segundos < 60) return `${segundos}s`;
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mr = m % 60;
  if (h < 24) return `${h}h ${mr}m`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return `${d}d ${hr}h`;
}

function formataEsperaCurta(segundos) {
  if (!segundos || segundos <= 0) return 'agora';
  if (segundos < 60) return `+${segundos}s`;
  const m = Math.floor(segundos / 60);
  if (m < 60) return `+${m}m`;
  const h = Math.floor(m / 60);
  const mr = m % 60;
  if (h < 24) return `+${h}h ${mr}m`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return `+${d}d ${hr}h`;
}

// ===== Logo do produto (reusa padrão visual do RailNavegacao) =====
function LogoProduto({ tamanho = 28 }) {
  return React.createElement('div', {
    style: {
      width: tamanho, height: tamanho, flexShrink: 0,
      borderRadius: '0.75rem', background: T.primaryGradient,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
    },
  },
    React.createElement('span', {
      className: 'material-symbols-outlined',
      style: { color: '#fff', fontSize: Math.round(tamanho * 0.6), fontVariationSettings: "'FILL' 1" },
    }, 'shield'),
  );
}

// ===== Componentes internos =====

function Greeting({ nome }) {
  const [hora, setHora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const saudacao = getSaudacao(hora);
  const primeiroNome = getPrimeiroNome(nome);

  return React.createElement('h2', {
    style: { fontSize: 26, fontWeight: 800, color: T.text, margin: 0, lineHeight: 1.3 },
  },
    React.createElement('span', { style: { color: T.primary } }, saudacao),
    primeiroNome ? `, ${primeiroNome}!` : '!',
  );
}

function LiveClock() {
  const [hora, setHora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const horaStr = hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dataStr = formataDataExtenso(hora);

  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      React.createElement(Clock, { size: 14, color: T.textMuted }),
      React.createElement('span', {
        style: { fontSize: 18, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.5 },
      }, horaStr),
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      React.createElement(Calendar, { size: 14, color: T.textMuted }),
      React.createElement('span', { style: { fontSize: 12, color: T.textSecondary } }, dataStr),
    ),
  );
}

function KpiCard({ label, valor, icone, cor, onClick, ativo }) {
  const Icon = icone;
  const tag = onClick ? 'button' : 'div';
  const style = {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px',
    background: ativo ? T.primarySoft : T.surface,
    border: `1px solid ${ativo ? T.primary : T.border}`,
    borderRadius: T.radius, minWidth: 0, flex: 1,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'border-color 0.15s, background 0.15s',
    textAlign: 'left',
    outline: 'none',
  };
  const props = tag === 'button'
    ? { onClick, 'aria-pressed': ativo, style, type: 'button' }
    : { style };

  return React.createElement(tag, props,
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      React.createElement('span', { style: { fontSize: 12, fontWeight: 600, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 } }, label),
      React.createElement(Icon, { size: 16, color: cor, 'aria-hidden': true }),
    ),
    React.createElement('span', { style: { fontSize: 24, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' } }, valor),
  );
}

function KpiStrip({ metrics, onSetFiltro, overrideFiltro }) {
  const naoLidas = metrics.nao_lidas || 0;
  const items = [
    { key: 'na_fila', label: 'Na fila', icon: Users, cor: T.textMuted, filtro: 'fila' },
    { key: 'em_atendimento', label: 'Em atendimento', icon: MessageCircle, cor: T.textMuted },
    { key: 'concluidos_hoje', label: 'Concluídos hoje', icon: CheckCircle2, cor: T.textMuted },
    { key: 'tma', label: 'T.M. 1ª resposta', icon: TrendingUp, cor: T.textMuted, format: formataTempo },
    { key: 'nao_lidas', label: 'Não lidas', icon: AlertTriangle, cor: naoLidas > 0 ? T.danger : T.textMuted, filtro: 'naolidas' },
  ];

  return React.createElement('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, width: '100%' },
  },
    items.map((item) => {
      const valorRaw = item.key === 'tma' ? metrics.tma_primeira_resposta_seg : metrics[item.key];
      const valor = item.format ? item.format(valorRaw) : (valorRaw ?? '—');
      const ativo = item.filtro && overrideFiltro?.tipo === item.filtro;
      const onClick = item.filtro
        ? () => onSetFiltro(ativo ? null : { tipo: item.filtro, valor: item.filtro })
        : undefined;
      return React.createElement(KpiCard, {
        key: item.key, label: item.label, valor, icone: item.icon, cor: item.cor, onClick, ativo,
      });
    }),
  );
}

function SlaItem({ conv, onClick }) {
  const seg = conv.espera_segundos || 0;
  const corSemaforo = seg < CONFIG.SLA_VERDE_ATE_SEG ? T.success
    : seg < CONFIG.SLA_AMARELO_APOS_SEG ? T.warning : T.danger;
  const SemaforoIcon = seg < CONFIG.SLA_VERDE_ATE_SEG ? CheckCircle2
    : seg < CONFIG.SLA_AMARELO_APOS_SEG ? Clock : AlertTriangle;
  const nome = conv.contato_nome || conv.contato_telefone || 'Desconhecido';
  const isNumber = !conv.contato_nome;
  const label = `${nome}, aguardando ${formataEsperaCurta(seg)}`;

  return React.createElement('button', {
    type: 'button',
    onClick: () => onClick(conv),
    'aria-label': label,
    style: {
      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
      padding: '10px 12px', border: 'none', borderRadius: T.radiusSm,
      background: 'transparent', cursor: 'pointer', textAlign: 'left',
      transition: 'background 0.15s',
    },
    onMouseEnter: (e) => { e.currentTarget.style.background = T.surfaceMuted; },
    onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
    onFocus: (e) => { e.currentTarget.style.background = T.surfaceMuted; },
    onBlur: (e) => { e.currentTarget.style.background = 'transparent'; },
  },
    React.createElement(Avatar, { nome, tamanho: 36, isNumber }),
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', {
        style: { fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        title: nome,
      }, nome),
      conv.departamento_nome && React.createElement(DeptBadge, { nome: conv.departamento_nome, cor: conv.departamento_cor }),
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 } },
      React.createElement(SemaforoIcon, { size: 14, color: corSemaforo }),
      React.createElement('span', {
        style: { fontSize: 12, fontWeight: 700, color: corSemaforo, fontVariantNumeric: 'tabular-nums' },
        'aria-label': `Aguardando ${formataEsperaCurta(seg)}`,
      }, formataEsperaCurta(seg)),
    ),
  );
}

function AttentionList({ items, onSelectConversa, carregando, abandonadas }) {
  return React.createElement('div', {
    style: { flex: 1, minWidth: 200 },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
      React.createElement(AlertTriangle, { size: 16, color: T.warning }),
      React.createElement('h3', { style: { fontSize: 13, fontWeight: 700, color: T.text, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0 } }, 'Precisa de atenção (SLA)'),
    ),
    carregando
      ? React.createElement(SlaSkeleton)
      : items.length === 0
      ? React.createElement('div', { style: { padding: '20px 0', textAlign: 'center' } },
          React.createElement('span', { style: { fontSize: 13, color: T.textMuted } }, 'Tudo em dia \u2014 nenhuma conversa aguardando resposta'))
      : React.createElement('div', { 'aria-live': 'polite', 'aria-label': `${items.length} conversas aguardando resposta` },
          items.map((c) => React.createElement(SlaItem, { key: c.id, conv: c, onClick: () => onSelectConversa(c) })),
        ),
    abandonadas > 0 && React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 0' },
    },
      React.createElement(Archive, { size: 12, color: T.textMuted }),
      React.createElement('span', { style: { fontSize: 11, color: T.textMuted } }, `Abandonadas (>7d): ${abandonadas}`),
    ),
  );
}

function SlaSkeleton() {
  return React.createElement('div', { 'aria-busy': true, 'aria-label': 'Carregando SLA' },
    [0, 1, 2].map((i) =>
      React.createElement('div', {
        key: i,
        style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' },
      },
        React.createElement('div', { className: 'skeleton-pulse', style: { width: 36, height: 36, borderRadius: '50%', background: T.surfaceMuted } }),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('div', { className: 'skeleton-pulse', style: { width: '50%', height: 12, borderRadius: 6, background: T.surfaceMuted, marginBottom: 6 } }),
          React.createElement('div', { className: 'skeleton-pulse', style: { width: '30%', height: 10, borderRadius: 5, background: T.surfaceMuted } }),
        ),
        React.createElement('div', { className: 'skeleton-pulse', style: { width: 50, height: 12, borderRadius: 6, background: T.surfaceMuted } }),
      ),
    ),
  );
}

function SectorBar({ dep, totalGeral, ativo, onClick }) {
  const pct = totalGeral > 0 ? (dep.total / totalGeral) * 100 : 0;
  const barColor = dep.departamento_cor || T.primary;

  return React.createElement('button', {
    type: 'button',
    onClick,
    'aria-pressed': ativo,
    'aria-label': `${dep.departamento_nome}: ${dep.total} conversas`,
    style: {
      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', border: 'none', borderRadius: T.radiusSm,
      background: ativo ? T.primarySoft : 'transparent',
      cursor: 'pointer', textAlign: 'left',
      transition: 'background 0.15s',
    },
    onMouseEnter: (e) => { if (!ativo) e.currentTarget.style.background = T.surfaceMuted; },
    onMouseLeave: (e) => { if (!ativo) e.currentTarget.style.background = 'transparent'; },
  },
    React.createElement('span', {
      style: { fontSize: 12, fontWeight: 600, color: T.text, width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      title: dep.departamento_nome,
    }, dep.departamento_nome),
    React.createElement('div', { style: { flex: 1, height: 8, background: T.surfaceMuted, borderRadius: 4, overflow: 'hidden' } },
      React.createElement('div', {
        style: {
          width: `${Math.max(pct, 2)}%`, height: '100%', borderRadius: 4,
          background: barColor, transition: 'width 0.4s ease',
        },
      }),
    ),
    React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 24, textAlign: 'right' } }, dep.total),
  );
}

function SectorVolume({ data, onToggleDepartamento, overrideFiltro, carregando }) {
  const header = React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
    React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 16, color: T.textMuted } }, 'bar_chart'),
    React.createElement('h3', { style: { fontSize: 13, fontWeight: 700, color: T.text, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0 } }, 'Volume por setor'),
  );

  if (carregando) {
    return React.createElement('div', { style: { flex: 1, minWidth: 200 }, 'aria-busy': true, 'aria-label': 'Carregando volume por setor' },
      header,
      [0, 1, 2, 3].map((i) =>
        React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' } },
          React.createElement('div', { className: 'skeleton-pulse', style: { width: 80, height: 12, borderRadius: 6, background: T.surfaceMuted } }),
          React.createElement('div', { className: 'skeleton-pulse', style: { flex: 1, height: 8, borderRadius: 4, background: T.surfaceMuted } }),
          React.createElement('div', { className: 'skeleton-pulse', style: { width: 24, height: 14, borderRadius: 6, background: T.surfaceMuted } }),
        ),
      ),
    );
  }

  if (!data || data.length === 0) {
    return React.createElement('div', { style: { flex: 1, minWidth: 200 } },
      header,
      React.createElement('p', { style: { fontSize: 13, color: T.textMuted, padding: '10px 0' } }, 'Nenhum setor com conversas abertas.'),
    );
  }

  const totalGeral = data.reduce((s, d) => s + d.total, 0);
  const ativoDepId = overrideFiltro?.tipo === 'departamento' ? overrideFiltro.valor : null;

  return React.createElement('div', { style: { flex: 1, minWidth: 200 } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 16, color: T.textMuted } }, 'bar_chart'),
        React.createElement('h3', { style: { fontSize: 13, fontWeight: 700, color: T.text, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0 } }, 'Volume por setor'),
      ),
      React.createElement('span', { style: { fontSize: 12, fontWeight: 600, color: T.textMuted } }, `Total: ${totalGeral}`),
    ),
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
      data.map((dep) => React.createElement(SectorBar, {
        key: dep.departamento_id,
        dep,
        totalGeral,
        ativo: ativoDepId === dep.departamento_id,
        onClick: () => onToggleDepartamento(dep.departamento_id, ativoDepId === dep.departamento_id),
      })),
    ),
  );
}

function QuickActions({ breakpoint, onFocusSearch, onChangeView }) {
  const ehMobile = breakpoint === 'mobile';
  const actions = [
    { key: 'busca', label: 'Buscar cidadão', icon: Search, shortcut: 'Ctrl+K', onClick: onFocusSearch },
    { key: 'protocolos', label: 'Protocolos', icon: FileText, onClick: () => onChangeView?.('protocolos') },
    { key: 'templates', label: 'Templates', icon: LayoutTemplate },
    { key: 'agenda', label: 'Agenda', icon: Calendar, onClick: () => onChangeView?.('agenda') },
  ];

  return React.createElement('div', {
    style: { display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' },
  },
    actions.map((a) => React.createElement('button', {
      key: a.key,
      type: 'button',
      onClick: a.onClick,
      style: {
        display: 'flex', alignItems: 'center', gap: 6,
        padding: ehMobile ? '8px 12px' : '8px 14px',
        border: `1px solid ${T.borderStrong}`,
        borderRadius: T.radiusSm,
        background: 'transparent',
        color: T.textSecondary,
        cursor: 'pointer',
        fontSize: 12, fontWeight: 600,
        whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      },
      onMouseEnter: (e) => { e.currentTarget.style.background = T.surfaceMuted; e.currentTarget.style.color = T.text; },
      onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textSecondary; },
    },
      React.createElement(a.icon, { size: 14 }),
      React.createElement('span', null, a.label),
      a.shortcut && !ehMobile && React.createElement('span', { style: { fontSize: 10, color: T.textMuted, marginLeft: 2 } }, a.shortcut),
    )),
  );
}

function FooterNote() {
  return React.createElement('div', {
    style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' },
  },
    React.createElement(Lock, { size: 12, color: T.textMuted }),
    React.createElement('span', { style: { fontSize: 11, color: T.textMuted } }, 'Criptografia de ponta a ponta'),
  );
}

// ===== Hook: useCalmo =====
function useCalmo() {
  const KEY = 'chatgov_modo_calmo';
  const [calmo, setCalmoState] = useState(() => {
    try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
  });
  const setCalmo = useCallback((v) => {
    setCalmoState(v);
    try { localStorage.setItem(KEY, String(v)); } catch {}
  }, []);
  return [calmo, setCalmo];
}

// ===== Hook: useOperacional (com SWR cache) =====
// Cache em memória: persiste entre mounts para mostrar resultado imediato
// ao fechar/abrir conversa, revalidando em background.
let _operationalCache = null;
let _operationalCacheKey = '';

function useOperacional({ socket, departamentoId }) {
  const [data, setData] = useState(() => _operationalCache);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(() => !_operationalCache);
  const abortRef = useRef(null);
  const staleRef = useRef(false);

  const cacheKey = departamentoId || '__global__';

  const carregar = useCallback(async (deptId) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await fetchOperacional({ departamentoId: deptId, signal: controller.signal });
      if (!controller.signal.aborted) {
        setData(result);
        setErro(null);
        _operationalCache = result;
        _operationalCacheKey = cacheKey;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        if (!controller.signal.aborted) setErro(err.message);
      }
    } finally {
      if (!controller.signal.aborted) setCarregando(false);
    }
  }, [cacheKey]);

  // Mount: se cache existe e bate a chave, mostra imediato e revalida em bg
  useEffect(() => {
    if (_operationalCache && _operationalCacheKey === cacheKey) {
      setData(_operationalCache);
      setCarregando(false);
      setErro(null);
    }
    // Revalida em background
    carregar(departamentoId);
  }, [departamentoId, cacheKey, carregar]);

  // Polling (60s) + socket events com debounce para evitar refetch duplicado
  useEffect(() => {
    const interval = setInterval(() => carregar(departamentoId), CONFIG.POLLING_INTERVAL_MS);

    let debounceTimer = null;
    const invalidar = () => {
      staleRef.current = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        staleRef.current = false;
        carregar(departamentoId);
      }, 2000);
    };

    if (socket) {
      socket.on('conversa:atualizada', invalidar);
      socket.on('conversa:removida', invalidar);
      socket.on('mensagem:nova', invalidar);
    }

    return () => {
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (abortRef.current) abortRef.current.abort();
      if (socket) {
        socket.off('conversa:atualizada', invalidar);
        socket.off('conversa:removida', invalidar);
        socket.off('mensagem:nova', invalidar);
      }
    };
  }, [socket, departamentoId, carregar]);

  return { data, erro, carregando, recarregar: () => carregar(departamentoId) };
}

// ===== Componente principal =====
export function PainelOperacional({
  nomeUsuario,
  breakpoint,
  isAdmin,
  verRelatorios,
  onSelectConversa,
  onSetFiltro,
  overrideFiltro,
  onOpenNovaConversa,
  onFocusSearch,
  onChangeView,
  socket,
}) {
  const [calmo, setCalmo] = useCalmo();
  const depId = overrideFiltro?.tipo === 'departamento' ? overrideFiltro.valor : undefined;
  const { data, erro, carregando, recarregar } = useOperacional({ socket, departamentoId: depId });
  const ehMobile = breakpoint === 'mobile';
  const metrics = data?.kpis || {};
  const sla = data?.sla || [];
  const abandonadas = data?.abandonadas || 0;
  const volume = data?.volume_por_setor || [];
  const primeiraCarga = carregando && !data;

  const handleToggleDepartamento = useCallback((depId, ativo) => {
    if (ativo) {
      onSetFiltro(null);
    } else {
      onSetFiltro({ tipo: 'departamento', valor: depId });
    }
  }, [onSetFiltro]);

  const handleSlaClick = useCallback((conv) => {
    onSelectConversa({
      id: conv.id,
      contato_nome: conv.contato_nome,
      contato_telefone: conv.contato_telefone,
    });
  }, [onSelectConversa]);

  // Modo calmo: versão simplificada
  if (calmo) {
    return React.createElement('div', {
      style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    },
      React.createElement('header', {
        style: {
          height: 64, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          React.createElement(LogoProduto, { tamanho: 28 }),
          React.createElement('span', { style: { fontSize: 14, fontWeight: 600, color: T.textSecondary } }, 'GovSistem Web'),
        ),
        React.createElement('button', {
          type: 'button',
          onClick: () => setCalmo(false),
          title: 'Alternar para painel completo',
          'aria-label': 'Alternar para painel completo',
          style: {
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            border: `1px solid ${T.borderStrong}`, borderRadius: T.radiusSm,
            background: 'transparent', cursor: 'pointer', color: T.textSecondary, fontSize: 12, fontWeight: 600,
          },
        }, React.createElement(Eye, { size: 14 }), 'Painel completo'),
      ),
      React.createElement('div', {
        style: {
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 24, background: T.bg,
        },
      },
        React.createElement(Greeting, { nome: nomeUsuario }),
        React.createElement(LiveClock),
        React.createElement('button', {
          type: 'button',
          onClick: onFocusSearch,
          style: {
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
            border: `1px solid ${T.borderStrong}`, borderRadius: T.radius,
            background: T.surface, cursor: 'pointer', color: T.textSecondary, fontSize: 14, fontWeight: 600,
          },
        },
          React.createElement(Search, { size: 16 }),
          'Buscar cidadão',
          React.createElement('span', { style: { fontSize: 11, color: T.textMuted, padding: '2px 6px', background: T.surfaceMuted, borderRadius: 4 } }, 'Ctrl+K'),
        ),
        React.createElement(FooterNote),
      ),
    );
  }

  // Painel completo
  return React.createElement('section', {
    'aria-label': 'Resumo operacional do atendimento',
    style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  },
    React.createElement('header', {
      style: {
        minHeight: 64, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        flexWrap: 'wrap', gap: 8,
      },
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement(LogoProduto, { tamanho: 28 }),
        React.createElement('span', { style: { fontSize: 14, fontWeight: 600, color: T.textSecondary } }, 'GovSistem Web'),
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('button', {
          type: 'button',
          onClick: () => setCalmo(true),
          title: 'Alternar para modo calmo',
          'aria-label': 'Alternar para modo calmo',
          style: {
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
            border: `1px solid ${T.borderStrong}`, borderRadius: T.radiusSm,
            background: 'transparent', cursor: 'pointer', color: T.textMuted, fontSize: 12, fontWeight: 600,
          },
        }, React.createElement(EyeOff, { size: 14 }), 'Modo calmo'),
        React.createElement('button', {
          type: 'button',
          onClick: onOpenNovaConversa,
          style: {
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            border: 'none', borderRadius: T.radiusSm, cursor: 'pointer',
            background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600,
            whiteSpace: 'nowrap',
          },
        }, React.createElement(MessageSquarePlus, { size: 15 }), 'Nova conversa'),
      ),
    ),

    React.createElement('div', {
      style: {
        flex: 1, overflowY: 'auto', padding: ehMobile ? '16px 12px' : '24px 24px 16px',
        display: 'flex', flexDirection: 'column', gap: 20, background: T.bg,
      },
    },
      React.createElement(Greeting, { nome: nomeUsuario }),
      React.createElement(LiveClock),
      carregando && !data
        ? React.createElement(KpiSkeleton)
        : erro
        ? React.createElement(KpiError, { onRetry: recarregar })
        : React.createElement(KpiStrip, { metrics, onSetFiltro, overrideFiltro }),
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: ehMobile ? '1fr' : '1fr 1fr', gap: 24 },
      },
        React.createElement(AttentionList, { items: sla, onSelectConversa: handleSlaClick, carregando: primeiraCarga, abandonadas }),
        React.createElement(SectorVolume, { data: volume, onToggleDepartamento: handleToggleDepartamento, overrideFiltro, carregando: primeiraCarga }),
      ),
      React.createElement(QuickActions, { breakpoint, onFocusSearch, onChangeView }),
      React.createElement(FooterNote),
    ),
  );
}

function KpiSkeleton() {
  return React.createElement('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 },
    'aria-busy': 'true', 'aria-label': 'Carregando métricas',
  },
    [0, 1, 2, 3, 4].map((i) =>
      React.createElement('div', {
        key: i,
        style: {
          padding: '14px 16px', background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.radius, minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 8,
        },
      },
        React.createElement('div', { className: 'skeleton-pulse', style: { width: '60%', height: 10, borderRadius: 5, background: T.surfaceMuted } }),
        React.createElement('div', { className: 'skeleton-pulse', style: { width: '40%', height: 22, borderRadius: 6, background: T.surfaceMuted } }),
      ),
    ),
  );
}

function KpiError({ onRetry }) {
  return React.createElement('div', {
    style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: T.dangerSoft, borderRadius: T.radiusSm },
  },
    React.createElement(AlertTriangle, { size: 16, color: T.danger }),
    React.createElement('span', { style: { fontSize: 13, color: T.danger, flex: 1 } }, 'Erro ao carregar métricas.'),
    React.createElement('button', {
      type: 'button',
      onClick: onRetry,
      style: {
        padding: '4px 10px', border: 'none', borderRadius: 4,
        background: T.danger, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      },
    }, 'Tentar novamente'),
  );
}
