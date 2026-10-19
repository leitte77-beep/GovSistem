import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  Loader2, RefreshCw, Printer, FileText, FileSpreadsheet,
  MessageCircle, TrendingUp, Clock, CheckCircle2, Users,
  ThumbsUp, Timer, AlertTriangle, ChevronDown, X,
  Square, CheckSquare, Download, Filter, LayoutDashboard, BarChart3,
} from 'lucide-react';
import { T, CORES_DEPT } from '../theme';
import {
  fetchRelatorioMetricas,
  fetchRelatorioNPSDetalhado,
  fetchRelatorioSLA,
  fetchRelatorioAssuntos,
  fetchFiltrosRelatorio,
  registrarExportacaoRelatorio,
} from '../api';

// ─────────── UTILITÁRIOS DE DATA ───────────

// Data no fuso LOCAL do navegador. Antes usávamos toISOString() (UTC): no
// Brasil, depois das 21h o "Hoje" virava o dia seguinte e o período saía errado.
function dataLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoHoje() {
  return dataLocal();
}

function isoDiasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dataLocal(d);
}

function primeiroDiaMes() {
  const d = new Date();
  return dataLocal(new Date(d.getFullYear(), d.getMonth(), 1));
}

function primeiroDiaMesPassado() {
  const d = new Date();
  return dataLocal(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

function ultimoDiaMesPassado() {
  const d = new Date();
  return dataLocal(new Date(d.getFullYear(), d.getMonth(), 0));
}

function formatarSeg(seg) {
  const s = Math.max(0, Math.round(seg || 0));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m ${s % 60}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

function formatarMinutos(min) {
  if (min == null || min === 0) return '0min';
  const m = Math.round(min);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

// Faixa clássica do NPS: 50+ excelente, 0+ razoável, negativo crítico.
function faixaNps(valor) {
  if (valor >= 50) return { rotulo: 'Excelente', cor: T.success };
  if (valor >= 0) return { rotulo: 'Razoável', cor: T.warning };
  return { rotulo: 'Crítico', cor: T.danger };
}

// ─────────── EXPORTAÇÃO ───────────

function matrizesRelatorio(d, npsDetalhado, sla, selecao, assuntos) {
  const r = d.resumo || {};
  const comp = d.comparacao;
  const sel = (key) => !selecao || selecao.length === 0 || selecao.includes(key);

  const blocos = [];

  if (sel('resumo')) {
    const resumo = [
      ['Relatório ChatGov'],
      ['Período', `${d.periodo?.inicio || ''} a ${d.periodo?.fim || ''}`],
      [],
      ['Indicador', 'Valor'],
      ['Conversas no período', r.criadas ?? 0],
      ['Mensagens recebidas', r.recebidas ?? 0],
      ['Mensagens enviadas', r.enviadas ?? 0],
      ['Tempo médio 1ª resposta (s)', r.tempo_primeira_resposta_seg ?? 0],
      ['Taxa de resolução (%)', r.taxa_resolucao ?? 0],
      ['Ativas agora', r.em_aberto ?? 0],
      ['Na fila agora', r.na_fila ?? 0],
      ['NPS', d.nps && d.nps.total_respondidos > 0 ? d.nps.nps : '—'],
      ['NPS (respostas)', d.nps?.total_respondidos ?? 0],
    ];
    if (comp) {
      resumo.push([]);
      resumo.push([`Comparação período anterior (${comp.periodo?.inicio || ''} a ${comp.periodo?.fim || ''})`]);
      resumo.push(['Conversas', comp.criadas ?? '—']);
      resumo.push(['Mensagens recebidas', comp.recebidas ?? '—']);
      resumo.push(['Mensagens enviadas', comp.enviadas ?? '—']);
      resumo.push(['Taxa de resolução (%)', comp.taxa_resolucao ?? '—']);
      resumo.push(['Tempo médio 1ª resposta (s)', comp.tempo_primeira_resposta_seg ?? '—']);
    }
    blocos.push(resumo);
  }

  if (sel('por_dia')) {
    blocos.push([[],[`Conversas por dia`,` `],...((d.por_dia || []).map((x) => [x.dia, x.total]))]);
  }

  if (sel('por_setor')) {
    blocos.push([[],[`Conversas por setor`,` `],...((d.por_setor || []).map((x) => [x.nome, x.total]))]);
  }

  if (sel('status')) {
    blocos.push([[],[`Status`,`Total`],...((d.por_status || []).map((x) => [x.status, x.total]))]);
  }

  if (sel('ranking')) {
    blocos.push([[],[`Atendente`,`Enviadas`,`Conversas`],...((d.ranking_atendentes || []).map((x) => [x.nome, x.enviadas, x.conversas]))]);
  }

  if (sel('assuntos') && (assuntos || []).length > 0) {
    blocos.push([[],[`Assunto`,`Total`],...assuntos.map((x) => [x.assunto, x.total])]);
  }

  if (sel('nps') && npsDetalhado?.geral) {
    const n = npsDetalhado.geral;
    blocos.push([[],
      ['NPS Detalhado'],
      ['NPS', n.nps ?? '—'],
      ['Promotores', n.promotores ?? 0],
      ['Neutros', n.neutros ?? 0],
      ['Detratores', n.detratores ?? 0],
      ['Total respostas', n.total_respondidos ?? 0],
      [],
      ['Setor', 'NPS', 'Respostas'],
      ...((npsDetalhado.por_setor || []).map((x) => [x.departamento_nome, x.nps, x.total])),
    ]);
  }

  if (sel('sla') && sla) {
    const s = sla;
    blocos.push([[],
      ['SLA / Tempo de Atendimento'],
      ['TMA', formatarMinutos(((s.tma_geral_seg || 0) / 60))],
      ['P95', formatarMinutos(((s.p95_resposta_seg || 0) / 60))],
      ['Taxa de Abandono', `${s.taxa_abandono ?? 0}%`],
      [],
      ['Setor', 'TMA'],
      ...((s.por_setor || []).map((x) => [x.nome, formatarMinutos(((x.tma_seg || 0) / 60))])),
    ]);
  }

  return { blocos };
}

function celulaCsv(v) {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function baixarArquivo(conteudo, nome, mime) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────── ESTILO IMPRESSÃO ───────────

// A impressão não reaproveita a tela: ela tem rolagem horizontal, abas e
// gráficos que medem a largura da janela, e saía cortada e sem cabeçalho.
// No beforeprint montamos um relatório próprio (portal no <body>) e o resto da
// página some — vale tanto para o botão quanto para Ctrl+P.
const ESTILO_IMPRESSAO = `
@media screen { #relatorio-impressao { display: none; } }
@media print {
  @page { size: A4; margin: 12mm 11mm 14mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body.imprimindo-relatorio > *:not(#relatorio-impressao) { display: none !important; }
  #relatorio-impressao { display: block; color: #111827; font-size: 11px; }
  #relatorio-impressao * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #relatorio-impressao .bloco { break-inside: avoid; page-break-inside: avoid; }
  #relatorio-impressao .nova-pagina { break-before: page; page-break-before: always; }
  #relatorio-impressao h2 { break-after: avoid; }
}
`;

// ─────────── CONSTANTES ───────────

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const STATUS_INFO = {
  fila: { label: 'Na fila', cor: T.warning },
  aberta: { label: 'Em atendimento', cor: T.primary },
  resolvida: { label: 'Resolvidas', cor: T.success },
  arquivada: { label: 'Arquivadas', cor: T.textMuted },
};

const CANAIS_INFO = [
  { value: '', label: 'Todos os canais' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'chat_interno', label: 'Chat Interno' },
  { value: 'chatbot', label: 'Chatbot' },
];

const STATUS_SELECT = [
  { value: '', label: 'Todos os status' },
  { value: 'fila', label: 'Fila' },
  { value: 'aberta', label: 'Em atendimento' },
  { value: 'resolvida', label: 'Resolvida' },
  { value: 'arquivada', label: 'Arquivada' },
];

const PERIODOS_RAPIDOS = [
  { label: 'Hoje', fn: () => ({ inicio: isoHoje(), fim: isoHoje() }) },
  { label: '7 dias', fn: () => ({ inicio: isoDiasAtras(6), fim: isoHoje() }) },
  { label: '30 dias', fn: () => ({ inicio: isoDiasAtras(29), fim: isoHoje() }) },
  { label: 'Este mês', fn: () => ({ inicio: primeiroDiaMes(), fim: isoHoje() }) },
  { label: 'Mês passado', fn: () => ({ inicio: primeiroDiaMesPassado(), fim: ultimoDiaMesPassado() }) },
];

const SECOES_EXPORT = [
  { key: 'resumo', label: 'Resumo (KPIs)' },
  { key: 'por_dia', label: 'Conversas por dia' },
  { key: 'por_setor', label: 'Conversas por setor' },
  { key: 'status', label: 'Status' },
  { key: 'ranking', label: 'Ranking de atendentes' },
  { key: 'assuntos', label: 'Assuntos mais frequentes' },
  { key: 'nps', label: 'NPS detalhado' },
  { key: 'sla', label: 'SLA' },
];

function mediaMovel(dados, janela) {
  const n = janela || 3;
  return dados.map((_, i) => {
    const inicio = Math.max(0, i - Math.floor(n / 2));
    const fim = Math.min(dados.length, i + Math.ceil(n / 2));
    const slice = dados.slice(inicio, fim);
    return slice.reduce((s, d) => s + d.value, 0) / slice.length;
  });
}

// ─────────── COMPONENTES INTERNOS ───────────

function CartaoKPI({ titulo, valor, sub, cor, icone, delta, deltaPositivo, compacto }) {
  const Icone = icone;
  return React.createElement('div', {
    style: {
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
      padding: compacto ? '8px 10px' : '14px 16px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
      Icone && React.createElement(Icone, { size: 16, style: { color: cor || T.textMuted, flexShrink: 0 } }),
      React.createElement('span', { style: { fontSize: compacto ? 10 : 12, color: T.textMuted, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, titulo),
    ),
    React.createElement('span', { style: { fontSize: compacto ? 18 : 26, fontWeight: 700, color: cor || T.text, lineHeight: 1.2 } }, valor),
    sub && !delta && React.createElement('span', { style: { fontSize: 11, color: T.textMuted } }, sub),
    delta != null && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 } },
      React.createElement('span', {
        style: {
          fontSize: 11, fontWeight: 600,
          color: deltaPositivo ? T.success : (delta < 0 ? T.danger : T.textMuted),
        },
      }, `${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} ${Math.abs(delta)}%`),
      React.createElement('span', { style: { fontSize: 11, color: T.textMuted } }, 'vs período anterior'),
    ),
    sub && delta != null && React.createElement('span', { style: { fontSize: 11, color: T.textMuted } }, sub),
  );
}

function Cartao({ titulo, valor, sub, cor }) {
  return React.createElement(CartaoKPI, { titulo, valor, sub, cor });
}

function Secao({ titulo, sub, children, acao }) {
  return React.createElement('div', {
    className: 'bloco',
    style: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, minWidth: 0 },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 } },
      React.createElement('div', null,
        React.createElement('h3', { style: { fontSize: 14, fontWeight: 700, color: T.text, margin: 0 } }, titulo),
        sub && React.createElement('p', { style: { fontSize: 11.5, color: T.textMuted, margin: '3px 0 0' } }, sub),
      ),
      acao || null,
    ),
    children,
  );
}

function TooltipOverlay({ tooltip }) {
  if (!tooltip) return null;
  return React.createElement('div', {
    style: {
      position: 'fixed',
      left: tooltip.x + 12,
      top: tooltip.y - 8,
      background: T.text,
      color: '#fff',
      padding: '6px 10px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      zIndex: 9999,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      boxShadow: T.shadowMd,
    },
  }, tooltip.texto);
}

function Skeleton({ altura, largura }) {
  return React.createElement('div', {
    style: {
      height: altura || 20,
      width: largura || '100%',
      background: T.surfaceMuted,
      borderRadius: 6,
      animation: 'opencode-skeleton 1.5s ease-in-out infinite',
    },
  });
}

function Toggle({ ativo, onChange, label }) {
  const alternar = () => onChange(!ativo);
  return React.createElement('div', {
    role: 'switch',
    'aria-checked': ativo,
    'aria-label': label || 'Alternar',
    tabIndex: 0,
    onClick: alternar,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); }
    },
    style: {
      width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
      background: ativo ? T.primary : T.surfaceMuted,
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      outlineOffset: 2,
    },
  },
    React.createElement('div', {
      style: {
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', position: 'absolute', top: 2,
        left: ativo ? 20 : 2, transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      },
    }),
  );
}

// ─────────── GRÁFICO DE DONUT (SVG) ───────────

function DonutChart({ dados, tamanho }) {
  const size = tamanho || 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const strokeW = size * 0.12;
  const circunferencia = 2 * Math.PI * r;
  const soma = (dados || []).reduce((s, d) => s + (Number(d.value) || 0), 0);
  if (!dados || dados.length === 0 || soma === 0) {
    return React.createElement('div', { style: { fontSize: 13, color: T.textMuted, padding: '8px 0' } }, 'Sem dados no período.');
  }
  const total = soma;
  let offset = 0;

  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' } },
    React.createElement('svg', { width: size, height: size, style: { flexShrink: 0 } },
      // círculo de fundo
      React.createElement('circle', {
        cx, cy, r, fill: 'none', stroke: T.surfaceMuted, strokeWidth: strokeW,
      }),
      dados.map((d, i) => {
        const pct = d.value / total;
        const dashLen = pct * circunferencia;
        const seg = React.createElement('circle', {
          key: i,
          cx, cy, r,
          fill: 'none',
          stroke: d.cor,
          strokeWidth: strokeW,
          strokeDasharray: `${dashLen} ${circunferencia - dashLen}`,
          strokeDashoffset: -offset,
          strokeLinecap: 'butt',
          transform: `rotate(-90 ${cx} ${cy})`,
          style: { transition: 'stroke-dasharray 0.4s ease' },
        });
        offset += dashLen;
        return seg;
      }),
      React.createElement('text', {
        x: cx, y: cy - 4, textAnchor: 'middle', fontSize: size * 0.14, fontWeight: 700, fill: T.text,
      }, total),
      React.createElement('text', {
        x: cx, y: cy + size * 0.1, textAnchor: 'middle', fontSize: size * 0.08, fill: T.textMuted,
      }, 'total'),
    ),
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      dados.map((d, i) => React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('div', {
          style: { width: 10, height: 10, borderRadius: 2, background: d.cor, flexShrink: 0 },
        }),
        React.createElement('span', { style: { fontSize: 12, color: T.text } },
          `${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)`),
      )),
    ),
  );
}

// ─────────── BARRAS HORIZONTAIS (COM TOOLTIP OPICIONAL) ───────────

function BarrasHorizontais({ dados, corPadrao, onHover }) {
  const max = Math.max(1, ...dados.map((d) => d.value));
  if (dados.length === 0) {
    return React.createElement('div', { style: { fontSize: 13, color: T.textMuted, padding: '8px 0' } }, 'Sem dados no período.');
  }
  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    dados.map((d, i) => React.createElement('div', { key: d.label + i, style: { display: 'flex', alignItems: 'center', gap: 10 } },
      React.createElement('span', {
        title: d.label,
        style: { width: 130, flexShrink: 0, fontSize: 12.5, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      }, d.label),
      React.createElement('div', { style: { flex: 1, background: T.surfaceMuted, borderRadius: 6, height: 18, overflow: 'hidden' } },
        React.createElement('div', {
          style: { width: `${(d.value / max) * 100}%`, height: '100%', background: d.cor || corPadrao || T.primary, borderRadius: 6, minWidth: d.value > 0 ? 4 : 0, transition: 'width 0.4s ease' },
          onMouseEnter: (e) => onHover && onHover({ texto: `${d.label}: ${d.sub != null ? d.sub : d.value}`, x: e.clientX, y: e.clientY }),
          onMouseLeave: () => onHover && onHover(null),
        })),
      React.createElement('span', { style: { width: 64, flexShrink: 0, textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: T.textSecondary } },
        d.sub != null ? d.sub : d.value),
    )),
  );
}

// ─────────── BARRAS DE NPS (DIVERGENTES, CENTRADAS NO ZERO) ───────────

function BarrasNps({ dados, onHover }) {
  const lista = dados || [];
  if (lista.length === 0) {
    return React.createElement('div', { style: { fontSize: 13, color: T.textMuted, padding: '8px 0' } }, 'Sem respostas no período.');
  }
  const cor = (v) => (v >= 50 ? T.success : v >= 0 ? T.warning : T.danger);
  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textMuted, paddingLeft: 130, paddingRight: 84 } },
      React.createElement('span', null, '−100'),
      React.createElement('span', null, '0'),
      React.createElement('span', null, '+100'),
    ),
    lista.map((d, i) => {
      const v = Math.max(-100, Math.min(100, Number(d.value) || 0));
      const largura = Math.min(100, Math.abs(v)) / 2; // 0..50% de cada lado
      return React.createElement('div', { key: d.label + i, style: { display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement('span', {
          title: d.label,
          style: { width: 130, flexShrink: 0, fontSize: 12.5, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        }, d.label),
        React.createElement('div', {
          style: { flex: 1, position: 'relative', height: 18, background: T.surfaceMuted, borderRadius: 6, overflow: 'hidden' },
        },
          React.createElement('div', { style: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: T.borderStrong } }),
          React.createElement('div', {
            onMouseEnter: (e) => onHover && onHover({ texto: `${d.label}: NPS ${v}`, x: e.clientX, y: e.clientY }),
            onMouseLeave: () => onHover && onHover(null),
            style: {
              position: 'absolute', top: 0, bottom: 0,
              left: v >= 0 ? '50%' : undefined,
              right: v < 0 ? '50%' : undefined,
              width: `${largura}%`, minWidth: v !== 0 ? 4 : 0,
              background: cor(v), borderRadius: 6, transition: 'width 0.4s ease',
            },
          }),
        ),
        React.createElement('span', { style: { width: 74, flexShrink: 0, textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: T.textSecondary } },
          d.sub != null ? d.sub : v),
      );
    }),
  );
}

// ─────────── BARRAS VERTICAIS COM LINHA DE TENDÊNCIA ───────────

function BarrasVerticais({ dados, mostrarLabelCada, linhaTendencia, onHover, larguraFixa, altura }) {
  const cada = mostrarLabelCada || Math.max(1, Math.ceil(dados.length / 12));
  const alt = altura || 140;
  const max = Math.max(1, ...dados.map((d) => d.value));
  const wrapRef = useRef(null);
  const [largura, setLargura] = useState(0);

  // Mede a largura disponível para posicionar a linha de tendência exatamente
  // sobre o centro das barras (antes a coordenada era chutada e desalinhava
  // quando as barras cresciam além do mínimo ou havia scroll horizontal).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || larguraFixa) return undefined;
    const medir = () => setLargura(el.clientWidth);
    medir();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(medir);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [larguraFixa]);

  const gap = 2;
  const n = Math.max(1, dados.length);
  const barraMin = Math.max(14, Math.min(30, 600 / n));
  const disponivel = larguraFixa || largura;
  const barraW = larguraFixa ? Math.max(4, (larguraFixa - (n - 1) * gap) / n) : disponivel > 0 ? Math.max(barraMin, (disponivel - (n - 1) * gap) / n) : barraMin;
  const total = n * barraW + (n - 1) * gap;

  return React.createElement('div', { ref: wrapRef, style: { overflowX: larguraFixa ? 'visible' : 'auto' } },
    React.createElement('div', { style: { position: 'relative', width: total, minWidth: '100%' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap, height: alt } },
        dados.map((d, i) => React.createElement('div', {
          key: d.label + i,
          style: { flex: `0 0 ${barraW}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 },
        },
          React.createElement('div', {
            style: {
              width: '70%', height: `${(d.value / max) * (alt - 16)}px`, minHeight: d.value > 0 ? 3 : 0,
              background: d.destaque ? T.primary : (T.chartBar || T.primarySoft), borderRadius: '3px 3px 0 0', transition: 'height 0.3s', cursor: 'pointer',
            },
            onMouseEnter: (e) => onHover && onHover({ texto: `${d.label}: ${d.value}`, x: e.clientX, y: e.clientY }),
            onMouseLeave: () => onHover && onHover(null),
          }),
          React.createElement('span', {
            style: { fontSize: 9, color: T.textSecondary, whiteSpace: 'nowrap', height: 12, lineHeight: '12px' },
          }, (i % cada === 0) ? d.label : ''),
        )),
      ),
      linhaTendencia && linhaTendencia.length > 0 && React.createElement('svg', {
        style: { position: 'absolute', top: 0, left: 0, width: total, height: alt - 16, pointerEvents: 'none', overflow: 'visible' },
      },
        React.createElement('polyline', {
          points: linhaTendencia.map((v, i) => {
            const x = i * (barraW + gap) + barraW / 2;
            const y = (alt - 16) - (v / max) * (alt - 16);
            return `${x},${y}`;
          }).join(' '),
          fill: 'none',
          stroke: T.primary,
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      ),
    ),
  );
}

// ─────────── HEATMAP ───────────

const ESCALA_CALOR = ['#dbeafe', '#93c5fd', '#3b82f6', '#1e40af'];

function HeatmapGrid({ porDiaHora, porHora }) {
  // Matriz 7×24 real (dia da semana × hora). Antes a mesma linha de horas era
  // repetida nos 7 dias, dando a impressão de um padrão semanal que não existia.
  const linhas = useMemo(() => {
    if (porDiaHora && porDiaHora.length > 0) {
      return DIAS_SEMANA.map((rotulo, i) => {
        const valores = Array(24).fill(0);
        porDiaHora.filter((x) => x.dia_semana === i + 1).forEach((x) => { valores[x.hora] = x.total; });
        return { rotulo, valores };
      });
    }
    const valores = Array(24).fill(0);
    (porHora || []).forEach((x) => { valores[x.hora] = x.total; });
    return [{ rotulo: 'Total', valores }];
  }, [porDiaHora, porHora]);

  const max = Math.max(0, ...linhas.flatMap((l) => l.valores));
  if (max === 0) {
    return React.createElement('div', { style: { fontSize: 13, color: T.textMuted, padding: '8px 0' } }, 'Sem mensagens no período.');
  }

  let pico = { rotulo: '', hora: 0, valor: 0 };
  linhas.forEach((l) => l.valores.forEach((v, h) => { if (v > pico.valor) pico = { rotulo: l.rotulo, hora: h, valor: v }; }));

  const cor = (v) => {
    if (v === 0) return T.surfaceMuted;
    const pct = v / max;
    return ESCALA_CALOR[pct < 0.25 ? 0 : pct < 0.5 ? 1 : pct < 0.75 ? 2 : 3];
  };
  const grade = { display: 'grid', gridTemplateColumns: '30px repeat(24, minmax(0, 1fr))', gap: 2, alignItems: 'center' };

  return React.createElement('div', null,
    React.createElement('div', { style: { ...grade, marginBottom: 2 } },
      React.createElement('span', null),
      Array.from({ length: 24 }, (_, h) => React.createElement('span', {
        key: h, style: { fontSize: 9, color: T.textMuted, textAlign: 'center' },
      }, h % 3 === 0 ? String(h).padStart(2, '0') : '')),
    ),
    linhas.map((l) => React.createElement('div', { key: l.rotulo, style: { ...grade, marginBottom: 2 } },
      React.createElement('span', { style: { fontSize: 10, color: T.textSecondary } }, l.rotulo),
      l.valores.map((v, h) => React.createElement('div', {
        key: h,
        title: `${l.rotulo} ${String(h).padStart(2, '0')}h — ${v} mensage${v === 1 ? 'm' : 'ns'}`,
        style: { height: 16, borderRadius: 3, background: cor(v) },
      })),
    )),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 10, fontSize: 10.5, color: T.textMuted } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
        React.createElement('span', null, 'Menos'),
        [T.surfaceMuted, ...ESCALA_CALOR].map((c, i) =>
          React.createElement('div', { key: i, style: { width: 12, height: 12, borderRadius: 2, background: c } })),
        React.createElement('span', null, 'Mais'),
      ),
      React.createElement('span', null, 'Pico: ',
        React.createElement('strong', { style: { color: T.text } },
          `${pico.rotulo === 'Total' ? '' : pico.rotulo + ' '}${String(pico.hora).padStart(2, '0')}h`),
        ` (${pico.valor} mensagens recebidas)`),
    ),
  );
}

// ─────────── MODAL DE EXPORTAÇÃO ───────────

function ModalExport({ isOpen, onClose, selecao, setSelecao, onExportarCSV, onExportarExcel, dados }) {
  if (!isOpen) return null;

  const toggleSecao = (key) => {
    setSelecao((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selecionarTodos = () => setSelecao(SECOES_EXPORT.map((s) => s.key));
  const desmarcarTodos = () => setSelecao([]);

  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const modalStyle = {
    background: T.surface, borderRadius: T.radius, padding: 24, width: 380, maxWidth: '90vw',
    boxShadow: T.shadowLg,
  };

  return React.createElement('div', { style: overlayStyle, onClick: (e) => e.target === e.currentTarget && onClose() },
    React.createElement('div', { style: modalStyle },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
        React.createElement('h3', { style: { fontSize: 15, fontWeight: 700, color: T.text, margin: 0 } }, 'Exportar Relatório'),
        React.createElement('button', {
          onClick: onClose,
          style: { border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: T.textMuted },
        }, React.createElement(X, { size: 18 })),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
        React.createElement('button', {
          onClick: selecionarTodos,
          style: { border: `1px solid ${T.borderStrong}`, background: T.surface, borderRadius: T.radiusSm, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: T.textSecondary, cursor: 'pointer' },
        }, 'Selecionar todos'),
        React.createElement('button', {
          onClick: desmarcarTodos,
          style: { border: `1px solid ${T.borderStrong}`, background: T.surface, borderRadius: T.radiusSm, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: T.textSecondary, cursor: 'pointer' },
        }, 'Desmarcar todos'),
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 } },
        SECOES_EXPORT.map((s) => React.createElement('div', {
          key: s.key,
          onClick: () => toggleSecao(s.key),
          style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' },
        },
          selecao.includes(s.key)
            ? React.createElement(CheckSquare, { size: 18, style: { color: T.primary, flexShrink: 0 } })
            : React.createElement(Square, { size: 18, style: { color: T.textMuted, flexShrink: 0 } }),
          React.createElement('span', { style: { fontSize: 13, color: T.text } }, s.label),
        )),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        React.createElement('button', {
          onClick: () => { onExportarCSV(); onClose(); },
          disabled: !dados,
          style: {
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 14px', borderRadius: T.radiusSm, border: `1px solid ${T.borderStrong}`,
            background: T.surface, color: T.textSecondary, fontSize: 13, fontWeight: 600,
            cursor: dados ? 'pointer' : 'not-allowed', opacity: dados ? 1 : 0.5,
          },
        }, React.createElement(FileText, { size: 15 }), 'Exportar CSV'),
        React.createElement('button', {
          onClick: () => { onExportarExcel(); onClose(); },
          disabled: !dados,
          style: {
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 14px', borderRadius: T.radiusSm, border: `1px solid ${T.borderStrong}`,
            background: T.surface, color: T.textSecondary, fontSize: 13, fontWeight: 600,
            cursor: dados ? 'pointer' : 'not-allowed', opacity: dados ? 1 : 0.5,
          },
        }, React.createElement(FileSpreadsheet, { size: 15 }), 'Exportar Excel'),
      ),
      React.createElement('button', {
        onClick: onClose,
        style: {
          width: '100%', marginTop: 8, padding: '8px 14px', borderRadius: T.radiusSm,
          border: 'none', background: T.surfaceAlt, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        },
      }, 'Cancelar'),
    ),
  );
}

// ═══════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════

export function PaginaRelatorios() {
  // ── filtros ──
  const [inicio, setInicio] = useState(isoDiasAtras(29));
  const [fim, setFim] = useState(isoHoje());
  const [departamentoId, setDepartamentoId] = useState('');
  const [operadorId, setOperadorId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [canal, setCanal] = useState('');
  const [comparar, setComparar] = useState(false);

  // ── dados ──
  const [dados, setDados] = useState(null);
  const [npsDetalhado, setNpsDetalhado] = useState(null);
  const [sla, setSla] = useState(null);
  const [assuntos, setAssuntos] = useState([]);
  const [filtros, setFiltros] = useState({ departamentos: [], operadores: [] });

  // ── loading / erro ──
  const [carregandoMetricas, setCarregandoMetricas] = useState(true);
  const [carregandoNPS, setCarregandoNPS] = useState(false);
  const [carregandoSLA, setCarregandoSLA] = useState(false);
  const [erroMetricas, setErroMetricas] = useState('');
  const [erroNPS, setErroNPS] = useState('');
  const [erroSLA, setErroSLA] = useState('');

  // ── UI ──
  const [abaAtiva, setAbaAtiva] = useState('geral');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSelecao, setExportSelecao] = useState(SECOES_EXPORT.map((s) => s.key));
  const [tooltip, setTooltip] = useState(null);
  const [periodoAtivo, setPeriodoAtivo] = useState('30 dias');

  const containerRef = useRef(null);

  // ── carregar filtros ao montar ──
  useEffect(() => {
    fetchFiltrosRelatorio()
      .then((f) => setFiltros({ departamentos: f.departamentos || [], operadores: f.operadores || [] }))
      .catch(() => {});
  }, []);

  // ── monta parâmetros de filtro ──
  const paramsFiltro = useMemo(() => {
    const p = {};
    if (departamentoId) p.departamentoId = departamentoId;
    if (operadorId) p.operadorId = operadorId;
    if (statusFilter) p.status = statusFilter;
    if (canal) p.canal = canal;
    if (comparar) p.comparar = true;
    return p;
  }, [departamentoId, operadorId, statusFilter, canal, comparar]);

  // ── carregar métricas ──
  const carregarMetricas = useCallback(async () => {
    setCarregandoMetricas(true);
    setErroMetricas('');
    try {
      const result = await fetchRelatorioMetricas(inicio, fim, paramsFiltro);
      setDados(result);
    } catch (e) {
      setErroMetricas(e.message || 'Erro ao carregar métricas.');
    } finally {
      setCarregandoMetricas(false);
    }
  }, [inicio, fim, paramsFiltro]);

  // ── carregar NPS ──
  const carregarNPS = useCallback(async () => {
    setCarregandoNPS(true);
    setErroNPS('');
    try {
      setNpsDetalhado(await fetchRelatorioNPSDetalhado(inicio, fim, paramsFiltro));
    } catch (e) {
      setErroNPS(e.message || 'Erro ao carregar NPS.');
    } finally {
      setCarregandoNPS(false);
    }
  }, [inicio, fim, paramsFiltro]);

  // ── carregar SLA ──
  const carregarSLA = useCallback(async () => {
    setCarregandoSLA(true);
    setErroSLA('');
    try {
      setSla(await fetchRelatorioSLA(inicio, fim, paramsFiltro));
    } catch (e) {
      setErroSLA(e.message || 'Erro ao carregar SLA.');
    } finally {
      setCarregandoSLA(false);
    }
  }, [inicio, fim, paramsFiltro]);

  // ── carregar assuntos (protocolos) ──
  const carregarAssuntos = useCallback(async () => {
    try {
      const res = await fetchRelatorioAssuntos(inicio, fim, paramsFiltro);
      setAssuntos(res?.assuntos || []);
    } catch {
      setAssuntos([]);
    }
  }, [inicio, fim, paramsFiltro]);

  // ── carregar tudo ──
  const carregarTudo = useCallback(async () => {
    await Promise.all([carregarMetricas(), carregarNPS(), carregarSLA(), carregarAssuntos()]);
  }, [carregarMetricas, carregarNPS, carregarSLA, carregarAssuntos]);

  // ── carrega métricas ao montar e a cada mudança de período/filtros ──
  // Debounce para não disparar uma query por ajuste de data. Antes o efeito só
  // rodava uma vez (deps []), e trocar filtro deixava a tela desatualizada até
  // clicar em "Atualizar".
  useEffect(() => {
    const id = setTimeout(() => { carregarMetricas(); }, 350);
    return () => clearTimeout(id);
  }, [carregarMetricas]);

  useEffect(() => {
    const id = setTimeout(() => { carregarAssuntos(); }, 350);
    return () => clearTimeout(id);
  }, [carregarAssuntos]);

  // A aba aberta acompanha os filtros (NPS e SLA têm endpoints próprios).
  useEffect(() => {
    if (abaAtiva === 'nps') carregarNPS();
  }, [abaAtiva, carregarNPS]);

  useEffect(() => {
    if (abaAtiva === 'sla') carregarSLA();
  }, [abaAtiva, carregarSLA]);

  // ── aplicar período rápido ──
  const aplicarPeriodoRapido = useCallback((label) => {
    setPeriodoAtivo(label);
    const item = PERIODOS_RAPIDOS.find((p) => p.label === label);
    if (item) {
      const { inicio: i, fim: f } = item.fn();
      setInicio(i);
      setFim(f);
    }
  }, []);

  // ── limpar filtros ──
  const limparFiltros = useCallback(() => {
    setDepartamentoId('');
    setOperadorId('');
    setStatusFilter('');
    setCanal('');
    setComparar(false);
    setPeriodoAtivo('30 dias');
    setInicio(isoDiasAtras(29));
    setFim(isoHoje());
  }, []);

  // ── dados computados ──
  const r = dados?.resumo || {};
  const nps = dados?.nps;
  const temComparacao = dados?.comparacao;

  const porDiaBarras = useMemo(() =>
    (dados?.por_dia || []).map((d) => ({
      label: d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7),
      value: d.total,
    })),
  [dados]);

  const tendenciaLinha = useMemo(() => mediaMovel(porDiaBarras, 3), [porDiaBarras]);

  const statusDonut = useMemo(() =>
    (dados?.por_status || []).map((s) => ({
      label: (STATUS_INFO[s.status] || {}).label || s.status,
      value: s.total,
      cor: (STATUS_INFO[s.status] || {}).cor || T.textMuted,
    })),
  [dados]);

  const npsDadosDonut = useMemo(() => {
    if (!npsDetalhado?.geral) return [];
    return [
      { label: 'Promotores', value: npsDetalhado.geral.promotores || 0, cor: T.success },
      { label: 'Neutros', value: npsDetalhado.geral.neutros || 0, cor: T.warning },
      { label: 'Detratores', value: npsDetalhado.geral.detratores || 0, cor: T.danger },
    ];
  }, [npsDetalhado]);

  // ── estilos compartilhados ──
  const inputEstilo = useMemo(() => ({
    padding: '7px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.borderStrong}`,
    fontSize: 12.5, color: T.text, background: T.surface, outline: 'none', fontFamily: 'inherit',
    minWidth: 0,
  }), []);

  const selectEstilo = useMemo(() => ({
    ...inputEstilo, cursor: 'pointer', appearance: 'auto',
  }), [inputEstilo]);

  const btnEstilo = useMemo(() => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: T.radiusSm,
    border: `1px solid ${T.borderStrong}`, background: T.surface, color: T.textSecondary,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  }), []);

  const chipEstilo = (ativo) => ({
    padding: '5px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${ativo ? T.primary : T.borderStrong}`,
    background: ativo ? T.primarySoft : T.surface,
    color: ativo ? T.primary : T.textSecondary,
    whiteSpace: 'nowrap', transition: 'all 0.15s',
  });

  const tabEstilo = (ativo) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: 'none', background: ativo ? T.primary : 'transparent',
    color: ativo ? '#fff' : T.textSecondary, borderRadius: T.radiusSm,
    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
  });

  // ── exportação ──
  const baseNome = `relatorio-chatgov-${inicio}_a_${fim}`;

  // O registro da exportação é auditoria: não pode impedir o download se a API
  // falhar. Antes o `await` sem catch travava a entrega do arquivo.
  const registrarExportacao = useCallback((formato) => {
    registrarExportacaoRelatorio(formato, { inicio, fim }, paramsFiltro).catch(() => {});
  }, [inicio, fim, paramsFiltro]);

  const exportarCSV = useCallback(() => {
    if (!dados) return;
    registrarExportacao('csv');
    const { blocos } = matrizesRelatorio(dados, npsDetalhado, sla, exportSelecao, assuntos);
    const linhas = [].concat(...blocos).map((linha) => linha.map(celulaCsv).join(';'));
    baixarArquivo('\uFEFF' + linhas.join('\r\n'), `${baseNome}.csv`, 'text/csv;charset=utf-8');
  }, [dados, npsDetalhado, sla, assuntos, exportSelecao, baseNome, registrarExportacao]);

  const exportarExcel = useCallback(async () => {
    if (!dados) return;
    registrarExportacao('xlsx');
    const { createXlsx } = await import('../utils/xlsx');
    const { blocos } = matrizesRelatorio(dados, npsDetalhado, sla, exportSelecao, assuntos);
    const arquivo = createXlsx(blocos.map((rows, index) => ({ name: `Seção ${index + 1}`, rows })));
    baixarArquivo(
      arquivo,
      `${baseNome}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }, [dados, npsDetalhado, sla, assuntos, exportSelecao, baseNome, registrarExportacao]);

  // ── impressão ──
  // O beforeprint monta o relatório de impressão de forma síncrona (flushSync),
  // senão o navegador tira a "foto" da página antes do React renderizar.
  const [imprimindo, setImprimindo] = useState(false);
  const [geradoEm, setGeradoEm] = useState('');

  useEffect(() => {
    const antes = () => {
      setGeradoEm(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
      flushSync(() => setImprimindo(true));
      document.body.classList.add('imprimindo-relatorio');
    };
    const depois = () => {
      document.body.classList.remove('imprimindo-relatorio');
      setImprimindo(false);
    };
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', depois);
    return () => {
      window.removeEventListener('beforeprint', antes);
      window.removeEventListener('afterprint', depois);
      document.body.classList.remove('imprimindo-relatorio');
    };
  }, []);

  const [preparandoImpressao, setPreparandoImpressao] = useState(false);
  const imprimir = async () => {
    registrarExportacao('impressao');
    // O relatório impresso traz as três abas: garante NPS e SLA carregados.
    setPreparandoImpressao(true);
    try {
      await Promise.all([npsDetalhado ? null : carregarNPS(), sla ? null : carregarSLA()]);
    } finally {
      setPreparandoImpressao(false);
    }
    setTimeout(() => window.print(), 50);
  };

  // ── rótulos dos filtros aplicados (cabeçalho da impressão) ──
  const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const filtrosAplicados = [
    departamentoId && `Setor: ${(filtros.departamentos.find((d) => String(d.id) === String(departamentoId)) || {}).nome || departamentoId}`,
    operadorId && `Atendente: ${(filtros.operadores.find((o) => String(o.id) === String(operadorId)) || {}).nome || operadorId}`,
    statusFilter && `Status: ${(STATUS_SELECT.find((x) => x.value === statusFilter) || {}).label}`,
    canal && `Canal: ${(CANAIS_INFO.find((x) => x.value === canal) || {}).label}`,
  ].filter(Boolean);
  const temFiltro = filtrosAplicados.length > 0 || comparar;

  const grade2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 16, marginBottom: 16 };
  const gradeKpi = (imp) => ({
    display: 'grid', gap: imp ? 8 : 12, marginBottom: 16,
    gridTemplateColumns: imp ? 'repeat(4, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))',
  });
  const alerta = (msg) => msg && React.createElement('div', {
    role: 'alert',
    style: { padding: '10px 14px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 13, marginBottom: 16 },
  }, msg);

  // ── conteúdo das abas (reaproveitado pela tela e pela impressão) ──
  function conteudoGeral(imp) {
    if (!dados) return null;
    const hover = imp ? null : setTooltip;
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'bloco', style: gradeKpi(imp) },
        React.createElement(CartaoKPI, {
          titulo: 'Conversas', valor: r.criadas ?? 0, icone: MessageCircle, cor: T.primary, compacto: imp,
          delta: temComparacao?.delta_criadas, deltaPositivo: (temComparacao?.delta_criadas || 0) >= 0,
        }),
        React.createElement(CartaoKPI, {
          titulo: 'Mensagens recebidas', valor: r.recebidas ?? 0, icone: TrendingUp, compacto: imp,
          delta: temComparacao?.delta_recebidas, deltaPositivo: (temComparacao?.delta_recebidas || 0) >= 0,
        }),
        React.createElement(CartaoKPI, {
          titulo: 'Mensagens enviadas', valor: r.enviadas ?? 0, icone: BarChart3, compacto: imp,
          delta: temComparacao?.delta_enviadas, deltaPositivo: (temComparacao?.delta_enviadas || 0) >= 0,
        }),
        React.createElement(CartaoKPI, {
          // Tempo maior é pior: a seta verde aparece quando o tempo cai.
          titulo: 'Tempo médio 1ª resposta', valor: formatarSeg(r.tempo_primeira_resposta_seg), icone: Timer, cor: T.primary, compacto: imp,
          delta: temComparacao?.delta_tempo_resposta, deltaPositivo: (temComparacao?.delta_tempo_resposta || 0) <= 0,
        }),
        React.createElement(CartaoKPI, {
          titulo: 'Taxa de resolução', valor: `${r.taxa_resolucao ?? 0}%`, icone: CheckCircle2, cor: T.success, compacto: imp,
          sub: `${r.resolvidas_periodo ?? 0} de ${r.criadas ?? 0} resolvidas`,
        }),
        React.createElement(CartaoKPI, {
          titulo: 'Em atendimento agora', valor: r.em_aberto ?? 0, icone: Users, compacto: imp, sub: 'situação atual',
        }),
        React.createElement(CartaoKPI, {
          titulo: 'Na fila agora', valor: r.na_fila ?? 0, icone: AlertTriangle, compacto: imp, sub: 'situação atual',
          cor: (r.na_fila || 0) > 0 ? T.warning : T.text,
        }),
        React.createElement(CartaoKPI, {
          titulo: 'NPS', valor: nps && nps.total_respondidos > 0 ? nps.nps : '—', icone: ThumbsUp, cor: T.primary, compacto: imp,
          sub: nps && nps.total_respondidos > 0 ? `${nps.total_respondidos} respostas` : 'sem respostas no período',
        }),
      ),

      React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement(Secao, { titulo: 'Conversas por dia', sub: 'Barras: conversas iniciadas no dia · linha: média móvel de 3 dias' },
          React.createElement(BarrasVerticais, {
            dados: porDiaBarras, linhaTendencia: tendenciaLinha, onHover: hover,
            larguraFixa: imp ? 640 : undefined, altura: imp ? 120 : 170,
          }),
        ),
      ),

      React.createElement('div', { style: grade2 },
        React.createElement(Secao, { titulo: 'Conversas por setor', sub: 'Conversas iniciadas no período (10 maiores)' },
          React.createElement(BarrasHorizontais, {
            dados: (dados.por_setor || []).map((s, i) => ({ label: s.nome, value: s.total, cor: CORES_DEPT[i % CORES_DEPT.length] })),
            onHover: hover,
          }),
        ),
        React.createElement(Secao, {
          titulo: 'Situação das conversas',
          // por_status não é recortado pelo período: é o retrato atual da base.
          sub: 'Todas as conversas na base hoje, independente do período',
        },
          React.createElement(DonutChart, { dados: statusDonut, tamanho: imp ? 120 : 160 }),
        ),
      ),

      React.createElement('div', { style: grade2 },
        React.createElement(Secao, { titulo: 'Horário de pico', sub: 'Mensagens recebidas por dia da semana e hora' },
          React.createElement(HeatmapGrid, { porDiaHora: dados.por_dia_hora, porHora: dados.por_hora }),
        ),
        React.createElement(Secao, { titulo: 'Ranking de atendentes', sub: 'Mensagens enviadas · conversas atendidas' },
          React.createElement(BarrasHorizontais, {
            corPadrao: T.primary,
            dados: (dados.ranking_atendentes || []).map((a) => ({ label: a.nome, value: a.enviadas, sub: `${a.enviadas} · ${a.conversas} conv.` })),
            onHover: hover,
          }),
        ),
      ),

      (assuntos || []).length > 0 && React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement(Secao, { titulo: 'Assuntos mais frequentes', sub: 'Protocolos abertos no período' },
          React.createElement(BarrasHorizontais, {
            dados: assuntos.map((a) => ({ label: a.assunto, value: a.total })),
            onHover: hover,
          }),
        ),
      ),
    );
  }

  function conteudoNps(imp) {
    if (!npsDetalhado) return null;
    const g = npsDetalhado.geral || {};
    const total = g.total_respondidos || 0;
    const pct = (v) => Math.round(((v || 0) / Math.max(1, total)) * 100);
    const hover = imp ? null : setTooltip;
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'bloco', style: gradeKpi(imp) },
        React.createElement(CartaoKPI, {
          titulo: 'NPS', valor: total > 0 ? Math.round(g.nps) : '—', icone: ThumbsUp, compacto: imp,
          sub: total > 0 ? `${faixaNps(g.nps).rotulo} · ${total} respostas` : 'sem respostas no período',
          cor: total > 0 ? faixaNps(g.nps).cor : T.textMuted,
        }),
        React.createElement(CartaoKPI, { titulo: 'Promotores (9–10)', valor: g.promotores ?? 0, icone: TrendingUp, cor: T.success, sub: `${pct(g.promotores)}%`, compacto: imp }),
        React.createElement(CartaoKPI, { titulo: 'Neutros (7–8)', valor: g.neutros ?? 0, icone: Clock, cor: T.warning, sub: `${pct(g.neutros)}%`, compacto: imp }),
        React.createElement(CartaoKPI, { titulo: 'Detratores (0–6)', valor: g.detratores ?? 0, icone: AlertTriangle, cor: T.danger, sub: `${pct(g.detratores)}%`, compacto: imp }),
      ),
      total > 0 && React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement(Secao, { titulo: 'Distribuição das respostas', sub: 'NPS = % promotores − % detratores' },
          React.createElement('div', { style: { display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: T.surfaceMuted } },
            [['promotores', T.success], ['neutros', T.warning], ['detratores', T.danger]].map(([k, c]) =>
              (g[k] || 0) > 0 && React.createElement('div', { key: k, title: `${k}: ${g[k]}`, style: { flex: g[k], background: c } })),
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: T.textMuted } },
            React.createElement('span', null, `Promotores ${pct(g.promotores)}%`),
            React.createElement('span', null, `Neutros ${pct(g.neutros)}%`),
            React.createElement('span', null, `Detratores ${pct(g.detratores)}%`),
          ),
        ),
      ),
      React.createElement('div', { style: grade2 },
        React.createElement(Secao, { titulo: 'NPS por setor' },
          React.createElement(BarrasNps, {
            dados: (npsDetalhado.por_setor || []).map((s) => ({ label: s.departamento_nome, value: s.nps || 0, sub: `${s.nps ?? '—'} · ${s.total || 0} resp.` })),
            onHover: hover,
          }),
        ),
        React.createElement(Secao, { titulo: 'NPS por atendente' },
          React.createElement(BarrasNps, {
            dados: (npsDetalhado.por_atendente || []).map((a) => ({ label: a.operador_nome, value: a.nps || 0, sub: `${a.nps ?? '—'} · ${a.total || 0} resp.` })),
            onHover: hover,
          }),
        ),
      ),
    );
  }

  function conteudoSla(imp) {
    if (!sla) return null;
    const hover = imp ? null : setTooltip;
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'bloco', style: { ...gradeKpi(imp), gridTemplateColumns: imp ? 'repeat(3, 1fr)' : gradeKpi(false).gridTemplateColumns } },
        React.createElement(CartaoKPI, {
          titulo: 'TMA (tempo médio de atendimento)', valor: formatarMinutos((sla.tma_geral_seg || 0) / 60), icone: Clock, cor: T.primary, compacto: imp,
        }),
        React.createElement(CartaoKPI, {
          // P95 é em segundos: formatarMinutos arredondava 20s para "0min".
          titulo: 'P95 da 1ª resposta', valor: formatarSeg(sla.p95_resposta_seg || 0), compacto: imp,
          icone: Timer, cor: sla.p95_resposta_seg > 600 ? T.warning : T.text, sub: '95% respondidas até este tempo',
        }),
        React.createElement(CartaoKPI, {
          titulo: 'Taxa de abandono', valor: `${sla.taxa_abandono ?? 0}%`, icone: AlertTriangle, compacto: imp,
          cor: (sla.taxa_abandono || 0) > 10 ? T.danger : (sla.taxa_abandono || 0) > 5 ? T.warning : T.success,
        }),
      ),
      React.createElement('div', { style: grade2 },
        React.createElement(Secao, { titulo: 'TMA por setor' },
          React.createElement(BarrasHorizontais, {
            corPadrao: T.primary,
            dados: (sla.por_setor || []).map((s) => ({ label: s.nome, value: s.tma_seg || 0, sub: formatarMinutos((s.tma_seg || 0) / 60) })),
            onHover: hover,
          }),
        ),
        sla.distribuicao_tempo && React.createElement(Secao, { titulo: 'Distribuição do tempo de resposta' },
          React.createElement(BarrasVerticais, {
            dados: sla.distribuicao_tempo.map((d) => ({ label: d.faixa, value: d.total })),
            mostrarLabelCada: 1, onHover: hover, larguraFixa: imp ? 300 : undefined,
          }),
        ),
      ),
    );
  }

  // ── relatório de impressão ──
  const tituloParte = (texto, quebra) => React.createElement('h2', {
    className: quebra ? 'nova-pagina' : undefined,
    style: { fontSize: 14, fontWeight: 700, color: '#111827', margin: '4px 0 10px', paddingBottom: 4, borderBottom: `2px solid ${T.primary}` },
  }, texto);

  const relatorioImpressao = imprimindo && createPortal(
    React.createElement('div', { id: 'relatorio-impressao' },
      React.createElement('div', { className: 'bloco', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, borderBottom: '1px solid #d1d5db', paddingBottom: 10, marginBottom: 14 } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.primary, textTransform: 'uppercase' } }, 'ChatGov · Central de Atendimento'),
          React.createElement('div', { style: { fontSize: 20, fontWeight: 700, color: '#111827', marginTop: 2 } }, 'Relatório de atendimento'),
          React.createElement('div', { style: { fontSize: 12, color: '#374151', marginTop: 4 } },
            `Período: ${fmtData(inicio)} a ${fmtData(fim)}`,
            temComparacao?.periodo && ` · comparado com ${fmtData(temComparacao.periodo.inicio)} a ${fmtData(temComparacao.periodo.fim)}`),
          React.createElement('div', { style: { fontSize: 11, color: '#6b7280', marginTop: 2 } },
            filtrosAplicados.length > 0 ? `Filtros: ${filtrosAplicados.join(' · ')}` : 'Sem filtros: todos os setores, atendentes, status e canais'),
        ),
        React.createElement('div', { style: { fontSize: 10, color: '#6b7280', textAlign: 'right', whiteSpace: 'nowrap' } }, `Gerado em ${geradoEm}`),
      ),
      tituloParte('1. Visão geral'),
      conteudoGeral(true),
      npsDetalhado && tituloParte('2. Satisfação (NPS)', true),
      conteudoNps(true),
      sla && tituloParte('3. Tempo de atendimento (SLA)'),
      conteudoSla(true),
    ),
    document.body,
  );

  // ── render ──
  const rotulo = (texto) => React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 58 } }, texto);

  return React.createElement('div', {
    id: 'relatorios-root',
    ref: containerRef,
    style: { flex: 1, height: '100%', overflowY: 'auto', overflowX: 'hidden', background: T.bg, padding: 20, position: 'relative' },
  },
    React.createElement('style', null, ESTILO_IMPRESSAO),
    React.createElement('style', null, `
      @keyframes opencode-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .spin { animation: opencode-spin 1s linear infinite; }
      @keyframes opencode-skeleton { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
    `),
    relatorioImpressao,

    React.createElement(TooltipOverlay, { tooltip }),

    React.createElement(ModalExport, {
      isOpen: showExportModal,
      onClose: () => setShowExportModal(false),
      selecao: exportSelecao,
      setSelecao: setExportSelecao,
      onExportarCSV: exportarCSV,
      onExportarExcel: exportarExcel,
      dados,
    }),

    // ═══════════════ CABEÇALHO ═══════════════
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
    },
      React.createElement('div', null,
        React.createElement('h2', { style: { fontSize: 20, fontWeight: 700, color: T.text, margin: 0 } }, 'Relatórios'),
        React.createElement('p', { style: { fontSize: 12.5, color: T.textMuted, margin: '3px 0 0' } },
          `${fmtData(inicio)} a ${fmtData(fim)}`,
          filtrosAplicados.length > 0 ? ` · ${filtrosAplicados.join(' · ')}` : ''),
      ),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        React.createElement('button', {
          onClick: carregarTudo, disabled: carregandoMetricas, title: 'Recarregar os dados agora',
          style: { ...btnEstilo, cursor: carregandoMetricas ? 'default' : 'pointer' },
        },
          React.createElement(RefreshCw, { size: 14, className: carregandoMetricas ? 'spin' : undefined }), 'Atualizar'),
        React.createElement('button', { onClick: imprimir, disabled: !dados || preparandoImpressao, title: 'Imprimir ou salvar como PDF (relatório completo)', style: btnEstilo },
          preparandoImpressao ? React.createElement(Loader2, { size: 15, className: 'spin' }) : React.createElement(Printer, { size: 15 }), 'Imprimir / PDF'),
        React.createElement('button', {
          onClick: () => setShowExportModal(true), disabled: !dados, title: 'Exportar dados em CSV ou Excel',
          style: { ...btnEstilo, border: 'none', background: T.primary, color: '#fff' },
        }, React.createElement(Download, { size: 15 }), 'Exportar'),
      ),
    ),

    // ═══════════════ FILTROS ═══════════════
    React.createElement('div', {
      style: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: '12px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 },
    },
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 } },
        rotulo('Período'),
        ...PERIODOS_RAPIDOS.map((p) =>
          React.createElement('button', { key: p.label, onClick: () => aplicarPeriodoRapido(p.label), style: chipEstilo(periodoAtivo === p.label) }, p.label)),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          React.createElement('input', { type: 'date', 'aria-label': 'Data inicial', value: inicio, max: fim, onChange: (e) => { setInicio(e.target.value); setPeriodoAtivo(''); }, style: { ...inputEstilo, width: 132 } }),
          React.createElement('span', { style: { fontSize: 12, color: T.textMuted } }, 'até'),
          React.createElement('input', { type: 'date', 'aria-label': 'Data final', value: fim, min: inicio, max: isoHoje(), onChange: (e) => { setFim(e.target.value); setPeriodoAtivo(''); }, style: { ...inputEstilo, width: 132 } }),
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' } },
          React.createElement(Toggle, { ativo: comparar, onChange: setComparar, label: 'Comparar com período anterior' }),
          React.createElement('span', { onClick: () => setComparar(!comparar), style: { fontSize: 12.5, color: T.textSecondary, cursor: 'pointer' } }, 'Comparar com período anterior'),
        ),
      ),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 } },
        rotulo('Filtros'),
        React.createElement('select', { 'aria-label': 'Setor', value: departamentoId, onChange: (e) => setDepartamentoId(e.target.value), style: { ...selectEstilo, flex: '1 1 150px', maxWidth: 220 } },
          React.createElement('option', { value: '' }, 'Todos os setores'),
          ...(filtros.departamentos || []).map((d) => React.createElement('option', { key: d.id, value: d.id }, d.nome))),
        React.createElement('select', { 'aria-label': 'Atendente', value: operadorId, onChange: (e) => setOperadorId(e.target.value), style: { ...selectEstilo, flex: '1 1 150px', maxWidth: 220 } },
          React.createElement('option', { value: '' }, 'Todos os atendentes'),
          ...(filtros.operadores || []).map((o) => React.createElement('option', { key: o.id, value: o.id }, o.nome))),
        React.createElement('select', { 'aria-label': 'Status', value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), style: { ...selectEstilo, flex: '1 1 130px', maxWidth: 180 } },
          ...STATUS_SELECT.map((x) => React.createElement('option', { key: x.value, value: x.value }, x.label))),
        React.createElement('select', { 'aria-label': 'Canal', value: canal, onChange: (e) => setCanal(e.target.value), style: { ...selectEstilo, flex: '1 1 130px', maxWidth: 180 } },
          ...CANAIS_INFO.map((x) => React.createElement('option', { key: x.value, value: x.value }, x.label))),
        temFiltro && React.createElement('button', {
          onClick: limparFiltros, title: 'Voltar aos filtros padrão',
          style: { ...btnEstilo, background: 'transparent', border: 'none', padding: '7px 8px', color: T.danger },
        }, React.createElement(X, { size: 15 }), 'Limpar filtros'),
      ),
    ),

    // ═══════════════ ABAS ═══════════════
    React.createElement('div', { role: 'tablist', style: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${T.border}` } },
      [['geral', 'Visão geral', LayoutDashboard], ['nps', 'Satisfação (NPS)', ThumbsUp], ['sla', 'Tempo de atendimento (SLA)', Clock]].map(([k, label, Icone]) =>
        React.createElement('button', {
          key: k, role: 'tab', 'aria-selected': abaAtiva === k, onClick: () => setAbaAtiva(k),
          style: {
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: 'none', background: 'transparent', whiteSpace: 'nowrap', marginBottom: -1,
            color: abaAtiva === k ? T.primary : T.textSecondary,
            borderBottom: `2px solid ${abaAtiva === k ? T.primary : 'transparent'}`,
          },
        }, React.createElement(Icone, { size: 14 }), label)),
    ),

    abaAtiva === 'geral' && React.createElement(React.Fragment, null,
      alerta(erroMetricas),
      carregandoMetricas && !dados
        ? React.createElement('div', { style: gradeKpi(false) },
            ...Array.from({ length: 8 }).map((_, i) => React.createElement(Skeleton, { key: i, altura: 84 })))
        : conteudoGeral(false),
    ),

    abaAtiva === 'nps' && React.createElement(React.Fragment, null,
      alerta(erroNPS),
      carregandoNPS && !npsDetalhado
        ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            React.createElement(Skeleton, { altura: 90 }), React.createElement(Skeleton, { altura: 160 }))
        : conteudoNps(false),
    ),

    abaAtiva === 'sla' && React.createElement(React.Fragment, null,
      alerta(erroSLA),
      carregandoSLA && !sla
        ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            React.createElement(Skeleton, { altura: 90 }), React.createElement(Skeleton, { altura: 160 }))
        : conteudoSla(false),
    ),

    React.createElement('p', { style: { marginTop: 8, textAlign: 'center', fontSize: 11.5, color: T.textMuted } },
      'Os dados acompanham o período e os filtros automaticamente. "Imprimir / PDF" gera o relatório completo das três abas.'),
  );
}

export default PaginaRelatorios;
