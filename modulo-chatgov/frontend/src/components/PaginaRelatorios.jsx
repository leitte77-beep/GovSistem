import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

function matrizesRelatorio(d, npsDetalhado, sla, selecao) {
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

const ESTILO_IMPRESSAO = `
@media print {
  .nao-imprimir { display: none !important; }
  .so-imprimir { display: block !important; }
  body * { visibility: hidden; }
  #relatorios-root, #relatorios-root * { visibility: visible; }
  #relatorios-root { position: absolute; left: 0; top: 0; width: 100%; padding: 12px; overflow: visible !important; height: auto !important; max-height: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { margin: 12mm; }
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
  { value: '', label: 'Todos' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'chat_interno', label: 'Chat Interno' },
  { value: 'chatbot', label: 'Chatbot' },
];

const STATUS_SELECT = [
  { value: '', label: 'Todos' },
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

function CartaoKPI({ titulo, valor, sub, cor, icone, delta, deltaPositivo, snap }) {
  const Icone = icone;
  return React.createElement('div', {
    style: {
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 144,
      flex: snap ? '0 0 144px' : undefined,
      scrollSnapAlign: snap ? 'start' : undefined,
    },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
      Icone && React.createElement(Icone, { size: 16, style: { color: cor || T.textMuted, flexShrink: 0 } }),
      React.createElement('span', { style: { fontSize: 12, color: T.textMuted, fontWeight: 600 } }, titulo),
    ),
    React.createElement('span', { style: { fontSize: 26, fontWeight: 700, color: cor || T.text, lineHeight: 1.2 } }, valor),
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

function Secao({ titulo, children, acao }) {
  return React.createElement('div', {
    style: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16 },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
      React.createElement('h3', { style: { fontSize: 14, fontWeight: 700, color: T.text, margin: 0 } }, titulo),
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

function BarrasVerticais({ dados, mostrarLabelCada, linhaTendencia, onHover }) {
  const cada = mostrarLabelCada || 1;
  const max = Math.max(1, ...dados.map((d) => d.value));
  const wrapRef = useRef(null);
  const [largura, setLargura] = useState(0);

  // Mede a largura disponível para posicionar a linha de tendência exatamente
  // sobre o centro das barras (antes a coordenada era chutada e desalinhava
  // quando as barras cresciam além do mínimo ou havia scroll horizontal).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const medir = () => setLargura(el.clientWidth);
    medir();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(medir);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const gap = 2;
  const n = Math.max(1, dados.length);
  const barraMin = Math.max(14, Math.min(30, 600 / n));
  const barraW = largura > 0 ? Math.max(barraMin, (largura - (n - 1) * gap) / n) : barraMin;
  const total = n * barraW + (n - 1) * gap;

  return React.createElement('div', { ref: wrapRef, style: { overflowX: 'auto' } },
    React.createElement('div', { style: { position: 'relative', width: total, minWidth: '100%' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap, height: 140 } },
        dados.map((d, i) => React.createElement('div', {
          key: d.label + i,
          style: { flex: `0 0 ${barraW}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 },
        },
          React.createElement('div', {
            style: {
              width: '70%', height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0,
              background: d.destaque ? T.primary : (T.chartBar || T.primarySoft), borderRadius: '3px 3px 0 0', transition: 'height 0.3s', cursor: 'pointer',
            },
            onMouseEnter: (e) => onHover && onHover({ texto: `${d.label}: ${d.value}`, x: e.clientX, y: e.clientY }),
            onMouseLeave: () => onHover && onHover(null),
          }),
          React.createElement('span', {
            style: { fontSize: 9, color: T.textSecondary, whiteSpace: 'nowrap' },
          }, (i % cada === 0) ? d.label : ''),
        )),
      ),
      linhaTendencia && linhaTendencia.length > 0 && React.createElement('svg', {
        style: { position: 'absolute', top: 0, left: 0, width: total, height: 140, pointerEvents: 'none' },
      },
        React.createElement('polyline', {
          points: linhaTendencia.map((v, i) => {
            const x = i * (barraW + gap) + barraW / 2;
            const y = 140 - (v / max) * 140;
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

function HeatmapGrid({ dadosHora }) {
  if (!dadosHora || dadosHora.length === 0) {
    return React.createElement('div', { style: { fontSize: 13, color: T.textMuted, padding: '8px 0' } }, 'Sem dados de horário.');
  }
  const maxHora = Math.max(1, Math.max(...dadosHora.map((h) => h.value)));
  const cellSize = 18;
  const gap = 2;
  const labelW = 30;

  function corIntensidade(valor) {
    const pct = valor / maxHora;
    if (pct === 0) return T.surfaceMuted;
    if (pct < 0.25) return '#dbeafe';
    if (pct < 0.5) return '#93c5fd';
    if (pct < 0.75) return '#3b82f6';
    return '#1e40af';
  }

  return React.createElement('div', { style: { overflowX: 'auto', paddingBottom: 4 } },
    // Cabeçalho com horas
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 1 } },
      React.createElement('div', { style: { width: labelW, flexShrink: 0 } }),
      dadosHora.map((h) => React.createElement('div', {
        key: h.label,
        style: { width: cellSize, height: 16, textAlign: 'center', fontSize: 8, color: T.textMuted, flexShrink: 0, marginRight: gap },
      }, String(h.label).padStart(2, '0'))),
    ),
    // Linhas (dias da semana)
    DIAS_SEMANA.map((dia) => React.createElement('div', { key: dia, style: { display: 'flex', alignItems: 'center' } },
      React.createElement('div', { style: { width: labelW, fontSize: 10, color: T.textSecondary, flexShrink: 0, lineHeight: `${cellSize}px` } }, dia),
      dadosHora.map((h) => React.createElement('div', {
        key: h.label,
        title: `${dia} ${String(h.label).padStart(2, '0')}h - ${h.value} msgs`,
        style: {
          width: cellSize, height: cellSize, borderRadius: 3,
          background: corIntensidade(h.value),
          flexShrink: 0, marginRight: gap,
          transition: 'background 0.2s',
        },
      })),
    )),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10, color: T.textMuted } },
      React.createElement('span', null, 'Baixo'),
      [T.surfaceMuted, '#dbeafe', '#93c5fd', '#3b82f6', '#1e40af'].map((c, i) =>
        React.createElement('div', { key: i, style: { width: 14, height: 14, borderRadius: 2, background: c, flexShrink: 0 } }),
      ),
      React.createElement('span', null, 'Alto'),
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
      setNpsDetalhado(await fetchRelatorioNPSDetalhado(inicio, fim));
    } catch (e) {
      setErroNPS(e.message || 'Erro ao carregar NPS.');
    } finally {
      setCarregandoNPS(false);
    }
  }, [inicio, fim]);

  // ── carregar SLA ──
  const carregarSLA = useCallback(async () => {
    setCarregandoSLA(true);
    setErroSLA('');
    try {
      setSla(await fetchRelatorioSLA(inicio, fim, departamentoId || undefined));
    } catch (e) {
      setErroSLA(e.message || 'Erro ao carregar SLA.');
    } finally {
      setCarregandoSLA(false);
    }
  }, [inicio, fim, departamentoId]);

  // ── carregar tudo ──
  const carregarTudo = useCallback(async () => {
    await Promise.all([carregarMetricas(), carregarNPS(), carregarSLA()]);
  }, [carregarMetricas, carregarNPS, carregarSLA]);

  // ── carrega métricas ao montar e a cada mudança de período/filtros ──
  // Debounce para não disparar uma query por ajuste de data. Antes o efeito só
  // rodava uma vez (deps []), e trocar filtro deixava a tela desatualizada até
  // clicar em "Atualizar".
  useEffect(() => {
    const id = setTimeout(() => { carregarMetricas(); }, 350);
    return () => clearTimeout(id);
  }, [carregarMetricas]);

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

  const horas = useMemo(() =>
    Array.from({ length: 24 }, (_, h) => {
      const achou = (dados?.por_hora || []).find((x) => x.hora === h);
      return { label: h, value: achou ? achou.total : 0 };
    }),
  [dados]);

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
    const { blocos } = matrizesRelatorio(dados, npsDetalhado, sla, exportSelecao);
    const linhas = [].concat(...blocos).map((linha) => linha.map(celulaCsv).join(';'));
    baixarArquivo('\uFEFF' + linhas.join('\r\n'), `${baseNome}.csv`, 'text/csv;charset=utf-8');
  }, [dados, npsDetalhado, sla, exportSelecao, baseNome, registrarExportacao]);

  const exportarExcel = useCallback(async () => {
    if (!dados) return;
    registrarExportacao('xlsx');
    const { createXlsx } = await import('../utils/xlsx');
    const { blocos } = matrizesRelatorio(dados, npsDetalhado, sla, exportSelecao);
    const arquivo = createXlsx(blocos.map((rows, index) => ({ name: `Seção ${index + 1}`, rows })));
    baixarArquivo(
      arquivo,
      `${baseNome}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }, [dados, npsDetalhado, sla, exportSelecao, baseNome, registrarExportacao]);

  const imprimir = () => {
    registrarExportacao('impressao');
    window.print();
  };

  // ── render ──
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

    // ═══════════════ TOOLTIP OVERLAY ═══════════════
    React.createElement(TooltipOverlay, { tooltip }),

    // ═══════════════ MODAL EXPORTAÇÃO ═══════════════
    React.createElement(ModalExport, {
      isOpen: showExportModal,
      onClose: () => setShowExportModal(false),
      selecao: exportSelecao,
      setSelecao: setExportSelecao,
      onExportarCSV: exportarCSV,
      onExportarExcel: exportarExcel,
      dados,
    }),

    // ═══════════════ HEADER STICKY ═══════════════
    React.createElement('div', {
      className: 'nao-imprimir',
      style: { position: 'sticky', top: 0, zIndex: 100, background: T.bg, paddingBottom: 12, marginBottom: 4 },
    },
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
      },
        React.createElement('div', null,
          React.createElement('h2', { style: { fontSize: 20, fontWeight: 700, color: T.text, margin: 0 } }, 'Relatórios'),
          React.createElement('p', { className: 'so-imprimir', style: { display: 'none', fontSize: 12, color: T.textMuted, margin: '4px 0 0' } },
            `Período: ${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`),
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          React.createElement('button', {
            onClick: carregarTudo, disabled: carregandoMetricas, 'aria-label': 'Atualizar',
            style: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: T.radiusSm, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: carregandoMetricas ? 'default' : 'pointer' },
          },
            React.createElement(RefreshCw, { size: 14, className: carregandoMetricas ? 'spin' : undefined }),
            'Atualizar',
          ),
          React.createElement('div', { style: { width: 1, height: 26, background: T.borderStrong, margin: '0 2px' } }),
          React.createElement('button', { onClick: imprimir, disabled: !dados, title: 'Imprimir ou salvar como PDF', style: btnEstilo },
            React.createElement(Printer, { size: 15 }), 'Imprimir'),
          React.createElement('button', { onClick: () => setShowExportModal(true), disabled: !dados, title: 'Exportar dados', style: btnEstilo },
            React.createElement(Download, { size: 15 }), 'Exportar'),
        ),
      ),

      // Painel de filtros
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', maskImage: 'linear-gradient(to right, #000 90%, transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 90%, transparent)', paddingRight: 20 } },
        // Períodos rápidos
        ...PERIODOS_RAPIDOS.map((p) =>
          React.createElement('button', {
            key: p.label,
            onClick: () => aplicarPeriodoRapido(p.label),
            style: chipEstilo(periodoAtivo === p.label),
          }, p.label),
        ),

        React.createElement('div', { style: { width: 1, height: 22, background: T.borderStrong, margin: '0 4px' } }),

        React.createElement('label', { style: { fontSize: 11.5, color: T.textMuted } }, 'De'),
        React.createElement('input', { type: 'date', value: inicio, max: fim, onChange: (e) => { setInicio(e.target.value); setPeriodoAtivo(''); }, style: { ...inputEstilo, width: 130 } }),
        React.createElement('label', { style: { fontSize: 11.5, color: T.textMuted } }, 'até'),
        React.createElement('input', { type: 'date', value: fim, min: inicio, max: isoHoje(), onChange: (e) => { setFim(e.target.value); setPeriodoAtivo(''); }, style: { ...inputEstilo, width: 130 } }),

        React.createElement('select', {
          value: departamentoId,
          onChange: (e) => setDepartamentoId(e.target.value),
          style: { ...selectEstilo, maxWidth: 160 },
        },
          React.createElement('option', { value: '' }, 'Todos os setores'),
          ...(filtros.departamentos || []).map((d) =>
            React.createElement('option', { key: d.id, value: d.id }, d.nome),
          ),
        ),

        React.createElement('select', {
          value: operadorId,
          onChange: (e) => setOperadorId(e.target.value),
          style: { ...selectEstilo, maxWidth: 160 },
        },
          React.createElement('option', { value: '' }, 'Todos os atendentes'),
          ...(filtros.operadores || []).map((o) =>
            React.createElement('option', { key: o.id, value: o.id }, o.nome),
          ),
        ),

        React.createElement('select', {
          value: statusFilter,
          onChange: (e) => setStatusFilter(e.target.value),
          style: { ...selectEstilo, maxWidth: 140 },
        },
          ...STATUS_SELECT.map((s) =>
            React.createElement('option', { key: s.value, value: s.value }, s.label),
          ),
        ),

        React.createElement('select', {
          value: canal,
          onChange: (e) => setCanal(e.target.value),
          style: { ...selectEstilo, maxWidth: 140 },
        },
          ...CANAIS_INFO.map((c) =>
            React.createElement('option', { key: c.value, value: c.value }, c.label),
          ),
        ),

        React.createElement('button', {
          onClick: limparFiltros,
          title: 'Limpar filtros',
          style: { ...btnEstilo, background: 'transparent', border: 'none', padding: '7px 8px' },
        }, React.createElement(X, { size: 15 }), 'Limpar'),
      ),

      // Toggle comparação (abaixo dos filtros)
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 } },
        React.createElement(Toggle, { ativo: comparar, onChange: setComparar, label: 'Comparar com período anterior' }),
        React.createElement('span', { style: { fontSize: 12.5, color: T.textSecondary } }, 'Comparar com período anterior'),
        React.createElement(Filter, { size: 13, style: { color: T.textMuted } }),
      ),
    ),

    // ═══════════════ TABS ═══════════════
    React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 18, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', maskImage: 'linear-gradient(to right, #000 92%, transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 92%, transparent)', paddingRight: 20 } },
      React.createElement('button', { onClick: () => setAbaAtiva('geral'), style: { ...tabEstilo(abaAtiva === 'geral'), scrollSnapAlign: 'start', flexShrink: 0 } },
        React.createElement(LayoutDashboard, { size: 14 }), 'Visão Geral'),
      React.createElement('button', { onClick: () => setAbaAtiva('nps'), style: { ...tabEstilo(abaAtiva === 'nps'), scrollSnapAlign: 'start', flexShrink: 0 } },
        React.createElement(ThumbsUp, { size: 14 }), 'NPS'),
      React.createElement('button', { onClick: () => setAbaAtiva('sla'), style: { ...tabEstilo(abaAtiva === 'sla'), scrollSnapAlign: 'start', flexShrink: 0 } },
        React.createElement(Clock, { size: 14 }), 'SLA'),
    ),

    // ═══════════════ ABA: VISÃO GERAL ═══════════════
    abaAtiva === 'geral' && React.createElement(React.Fragment, null,

      erroMetricas && React.createElement('div', {
        role: 'alert',
        style: { padding: '10px 14px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 13, marginBottom: 16 },
      }, erroMetricas),

      // ── KPIs ──
      carregandoMetricas && !dados
        ? React.createElement('div', {
            className: 'kpi-grid',
            style: { display: 'flex', gap: 12, marginBottom: 18, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', maskImage: 'linear-gradient(to right, #000 92%, transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 92%, transparent)', minHeight: 98, paddingRight: 16 },
          },
            ...Array.from({ length: 8 }).map((_, i) =>
              React.createElement('div', { key: i, style: { flex: '0 0 144px', scrollSnapAlign: 'start' } },
                React.createElement(Skeleton, { key: i, altura: 80 }))),
          )
        : dados && React.createElement('div', {
            style: { display: 'flex', gap: 12, marginBottom: 18, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', maskImage: 'linear-gradient(to right, #000 92%, transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 92%, transparent)', minHeight: 98, paddingRight: 16 },
          },
            React.createElement(CartaoKPI, {
              titulo: 'Conversas', valor: r.criadas ?? 0,
              icone: MessageCircle, cor: T.primary,
              delta: temComparacao?.delta_criadas,
              deltaPositivo: (temComparacao?.delta_criadas || 0) >= 0,
              snap: true,
            }),
            React.createElement(CartaoKPI, {
              titulo: 'Mensagens recebidas', valor: r.recebidas ?? 0,
              icone: TrendingUp,
              delta: temComparacao?.delta_recebidas,
              deltaPositivo: (temComparacao?.delta_recebidas || 0) >= 0,
              snap: true,
            }),
            React.createElement(CartaoKPI, {
              titulo: 'Mensagens enviadas', valor: r.enviadas ?? 0,
              icone: BarChart3,
              delta: temComparacao?.delta_enviadas,
              deltaPositivo: (temComparacao?.delta_enviadas || 0) >= 0,
              snap: true,
            }),
            React.createElement(CartaoKPI, {
              titulo: 'Tempo 1ª resposta', valor: formatarSeg(r.tempo_primeira_resposta_seg),
              icone: Timer, cor: T.primary,
              snap: true,
            }),
            React.createElement(CartaoKPI, {
              titulo: 'Taxa de resolução', valor: `${r.taxa_resolucao ?? 0}%`,
              sub: `${r.resolvidas_periodo ?? 0} resolvidas`, icone: CheckCircle2, cor: T.success,
              snap: true,
            }),
            React.createElement(CartaoKPI, {
              titulo: 'Ativas agora', valor: r.em_aberto ?? 0,
              icone: Users,
              snap: true,
            }),
            React.createElement(CartaoKPI, {
              titulo: 'Na fila', valor: r.na_fila ?? 0,
              icone: AlertTriangle, cor: (r.na_fila || 0) > 0 ? T.warning : T.text,
              snap: true,
            }),
            nps && React.createElement(CartaoKPI, {
              titulo: 'NPS', valor: nps.total_respondidos > 0 ? nps.nps : '—',
              sub: `${nps.total_respondidos || 0} respostas`,
              icone: ThumbsUp, cor: T.primary,
              snap: true,
            }),
          ),

      dados && React.createElement(React.Fragment, null,
        // ── Conversas por dia com linha de tendência ──
        React.createElement('div', { style: { marginBottom: 18 } },
          React.createElement(Secao, { titulo: 'Conversas por dia' },
            React.createElement(BarrasVerticais, {
              dados: porDiaBarras,
              mostrarLabelCada: porDiaBarras.length > 15 ? 3 : 1,
              linhaTendencia: tendenciaLinha,
              onHover: setTooltip,
            }),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 } },
              React.createElement('div', { style: { width: 12, height: 2, background: T.primary, borderRadius: 1 } }),
              React.createElement('span', { style: { fontSize: 10, color: T.textMuted } }, 'Linha de tendência (média móvel 3 dias)'),
            ),
          ),
        ),

        // ── Grid: setor + status donut ──
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 18, marginBottom: 18 } },
          React.createElement(Secao, { titulo: 'Conversas por setor' },
            React.createElement(BarrasHorizontais, {
              dados: (dados.por_setor || []).map((s, i) => ({ label: s.nome, value: s.total, cor: CORES_DEPT[i % CORES_DEPT.length] })),
              onHover: setTooltip,
            }),
          ),
          React.createElement(Secao, { titulo: 'Distribuição por status' },
            React.createElement(DonutChart, { dados: statusDonut }),
          ),
        ),

        // ── Grid: heatmap + ranking ──
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 18, marginBottom: 18 } },
          React.createElement(Secao, { titulo: 'Mapa de calor — Horário de pico' },
            React.createElement(HeatmapGrid, { dadosHora: horas }),
          ),
          React.createElement(Secao, { titulo: 'Ranking de atendentes' },
            React.createElement(BarrasHorizontais, {
              corPadrao: T.primary,
              dados: (dados.ranking_atendentes || []).map((a) => ({ label: a.nome, value: a.enviadas, sub: `${a.enviadas} · ${a.conversas} conv.` })),
              onHover: setTooltip,
            }),
          ),
        ),
      ),
    ),

    // ═══════════════ ABA: NPS ═══════════════
    abaAtiva === 'nps' && React.createElement(React.Fragment, null,

      erroNPS && React.createElement('div', {
        role: 'alert',
        style: { padding: '10px 14px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 13, marginBottom: 16 },
      }, erroNPS),

      carregandoNPS && !npsDetalhado
        ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            React.createElement(Skeleton, { altura: 180 }),
            React.createElement(Skeleton, { altura: 120 }),
            React.createElement(Skeleton, { altura: 120 }),
          )
        : npsDetalhado && React.createElement(React.Fragment, null,
            // Cards NPS
            React.createElement('div', {
              style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 },
            },
              React.createElement(CartaoKPI, {
                titulo: 'NPS Score',
                valor: (npsDetalhado.geral?.total_respondidos || 0) > 0 ? Math.round(npsDetalhado.geral.nps) : '—',
                sub: (npsDetalhado.geral?.total_respondidos || 0) > 0
                  ? `${faixaNps(npsDetalhado.geral.nps).rotulo} · ${npsDetalhado.geral.total_respondidos} respostas`
                  : 'sem respostas no período',
                icone: ThumbsUp,
                cor: (npsDetalhado.geral?.total_respondidos || 0) > 0 ? faixaNps(npsDetalhado.geral.nps).cor : T.textMuted,
              }),
              React.createElement(CartaoKPI, {
                titulo: 'Promotores', valor: npsDetalhado.geral?.promotores ?? 0,
                icone: TrendingUp, cor: T.success,
                sub: `${npsDetalhado.geral?.total_respondidos ? Math.round((npsDetalhado.geral.promotores || 0) / npsDetalhado.geral.total_respondidos * 100) : 0}%`,
              }),
              React.createElement(CartaoKPI, {
                titulo: 'Neutros', valor: npsDetalhado.geral?.neutros ?? 0,
                icone: Clock, cor: T.warning,
                sub: `${npsDetalhado.geral?.total_respondidos ? Math.round((npsDetalhado.geral.neutros || 0) / npsDetalhado.geral.total_respondidos * 100) : 0}%`,
              }),
              React.createElement(CartaoKPI, {
                titulo: 'Detratores', valor: npsDetalhado.geral?.detratores ?? 0,
                icone: AlertTriangle, cor: T.danger,
                sub: `${npsDetalhado.geral?.total_respondidos ? Math.round((npsDetalhado.geral.detratores || 0) / npsDetalhado.geral.total_respondidos * 100) : 0}%`,
              }),
            ),

            // Distribuição NPS
            React.createElement('div', { style: { marginBottom: 18 } },
              React.createElement(Secao, { titulo: 'Distribuição NPS' },
                npsDadosDonut.length > 0 && React.createElement(DonutChart, { dados: npsDadosDonut, tamanho: 140 }),
                // Barra de distribuição horizontal
                 React.createElement('div', { style: { display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginTop: 16 } },
                  React.createElement('div', {
                    title: `Promotores: ${npsDetalhado.geral?.promotores || 0}`,
                    style: {
                      flex: (npsDetalhado.geral?.promotores || 0) / Math.max(1, npsDetalhado.geral?.total_respondidos || 1),
                      background: T.success, transition: 'flex 0.4s ease', minWidth: npsDetalhado.geral?.promotores > 0 ? 2 : 0,
                    },
                  }),
                  React.createElement('div', {
                    title: `Neutros: ${npsDetalhado.geral?.neutros || 0}`,
                    style: {
                      flex: (npsDetalhado.geral?.neutros || 0) / Math.max(1, npsDetalhado.geral?.total_respondidos || 1),
                      background: T.warning, minWidth: npsDetalhado.geral?.neutros > 0 ? 2 : 0,
                    },
                  }),
                  React.createElement('div', {
                    title: `Detratores: ${npsDetalhado.geral?.detratores || 0}`,
                    style: {
                      flex: (npsDetalhado.geral?.detratores || 0) / Math.max(1, npsDetalhado.geral?.total_respondidos || 1),
                      background: T.danger, transition: 'flex 0.4s ease', minWidth: npsDetalhado.geral?.detratores > 0 ? 2 : 0,
                      borderRadius: '0 6px 6px 0',
                    },
                  }),
                ),
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: T.textMuted } },
                  React.createElement('span', null, `Promotores ${Math.round(((npsDetalhado.geral?.promotores || 0) / Math.max(1, npsDetalhado.geral?.total_respondidos || 1)) * 100)}%`),
                  React.createElement('span', null, `Neutros ${Math.round(((npsDetalhado.geral?.neutros || 0) / Math.max(1, npsDetalhado.geral?.total_respondidos || 1)) * 100)}%`),
                  React.createElement('span', null, `Detratores ${Math.round(((npsDetalhado.geral?.detratores || 0) / Math.max(1, npsDetalhado.geral?.total_respondidos || 1)) * 100)}%`),
                ),
              ),
            ),

            // NPS por setor e por atendente
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 18 } },
                React.createElement(Secao, { titulo: 'NPS por Setor' },
                  React.createElement(BarrasNps, {
                    dados: (npsDetalhado.por_setor || []).map((s) => ({
                      label: s.departamento_nome, value: s.nps || 0,
                      sub: `${s.nps ?? '—'} · ${s.total || 0} respostas`,
                    })),
                    onHover: setTooltip,
                  }),
                ),
                React.createElement(Secao, { titulo: 'NPS por Atendente' },
                  React.createElement(BarrasNps, {
                    dados: (npsDetalhado.por_atendente || []).map((a) => ({
                      label: a.operador_nome, value: a.nps || 0,
                      sub: `${a.nps ?? '—'} · ${a.total || 0} respostas`,
                    })),
                    onHover: setTooltip,
                  }),
                ),
            ),
          ),
    ),

    // ═══════════════ ABA: SLA ═══════════════
    abaAtiva === 'sla' && React.createElement(React.Fragment, null,

      erroSLA && React.createElement('div', {
        role: 'alert',
        style: { padding: '10px 14px', background: T.dangerSoft, color: T.danger, borderRadius: T.radiusSm, fontSize: 13, marginBottom: 16 },
      }, erroSLA),

      carregandoSLA && !sla
        ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            React.createElement(Skeleton, { altura: 100 }),
            React.createElement(Skeleton, { altura: 140 }),
            React.createElement(Skeleton, { altura: 140 }),
          )
        : sla && React.createElement(React.Fragment, null,
            // Cards SLA
            React.createElement('div', {
              style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 },
            },
              React.createElement(CartaoKPI, {
                titulo: 'TMA (Tempo Médio)', valor: formatarMinutos((sla.tma_geral_seg || 0) / 60),
                icone: Clock, cor: T.primary,
              }),
              React.createElement(CartaoKPI, {
                // P95 é em segundos: formatarMinutos arredondava 20s para "0min".
                titulo: 'P95', valor: formatarSeg(sla.p95_resposta_seg || 0),
                icone: Timer, cor: sla.p95_resposta_seg > 600 ? T.warning : T.text,
                sub: '95% das conversas',
              }),
              React.createElement(CartaoKPI, {
                titulo: 'Taxa de Abandono', valor: `${sla.taxa_abandono ?? 0}%`,
                icone: AlertTriangle, cor: (sla.taxa_abandono || 0) > 10 ? T.danger : (sla.taxa_abandono || 0) > 5 ? T.warning : T.success,
              }),
            ),

            // TMA por setor
            React.createElement('div', { style: { marginBottom: 18 } },
              React.createElement(Secao, { titulo: 'TMA por Setor' },
                React.createElement(BarrasHorizontais, {
                  corPadrao: T.primary,
                  dados: (sla.por_setor || []).map((s) => ({
                    label: s.nome,
                    value: s.tma_seg || 0,
                    sub: formatarMinutos((s.tma_seg || 0) / 60),
                  })),
                  onHover: setTooltip,
                }),
              ),
            ),

            // Distribuição de tempo de resposta
            sla.distribuicao_tempo && React.createElement(Secao, { titulo: 'Distribuição do tempo de resposta' },
              React.createElement(BarrasVerticais, {
                dados: sla.distribuicao_tempo.map((d) => ({ label: d.faixa, value: d.total })),
                mostrarLabelCada: 1,
                onHover: setTooltip,
              }),
            ),

            // Assuntos (opcional, carrega junto com SLA)
            React.createElement('div', {
              style: { marginTop: 18, textAlign: 'center', fontSize: 12, color: T.textMuted },
            }, 'Os dados acompanham automaticamente o período e os filtros; use "Atualizar" para recarregar na hora.'),
          ),
    ),
  );
}

export default PaginaRelatorios;
