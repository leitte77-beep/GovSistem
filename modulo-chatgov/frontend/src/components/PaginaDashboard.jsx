import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlarmClock, ArrowDownRight, ArrowUpRight, Bot, CheckCircle2,
  Clock3, Download, FileSpreadsheet, FileText, Headphones, Hourglass, Inbox,
  MessageCircle, Printer, RefreshCw, Star, Timer, Users,
} from 'lucide-react';
import { fetchDashboard, fetchDepartamentos, fetchRelatorioMetricas, registrarExportacaoRelatorio } from '../api';
import { useAuth } from '../context/AuthContext';
import { T } from '../theme';
import {
  dataLocal, descreverFiltros, formatarDataBr, formatarDataCurta, formatarTempo,
  matrizesDashboard, periodosRapidos, ROTULO_SITUACAO, situacaoMeta,
} from '../utils/dashboard';
import { baixarArquivo, montarCsv, nomeArquivoExport } from '../utils/exportar';

const STATUS_LABELS = {
  fila: 'Aguardando',
  aberta: 'Em atendimento',
  resolvida: 'Resolvidas',
  arquivada: 'Arquivadas',
};

const STATUS_CORES = {
  fila: '#D97706',
  aberta: '#2563EB',
  resolvida: '#16A34A',
  arquivada: '#64748B',
};

// Cada status da rosca leva ao filtro equivalente da lista de conversas.
const STATUS_DRILL = {
  fila: 'fila',
  aberta: 'em_atendimento',
  resolvida: 'resolvidas',
  arquivada: 'arquivadas',
};

const CANAIS = [
  { valor: '', rotulo: 'Todo o atendimento' },
  { valor: 'chatbot', rotulo: 'Iris (assistente)' },
  { valor: 'humano', rotulo: 'Equipe (humano)' },
];

const FAIXAS_FILA = [
  { chave: 'ate_15', rotulo: 'até 15 min', cor: '#16A34A' },
  { chave: 'de_15_30', rotulo: '15 a 30 min', cor: '#D97706' },
  { chave: 'de_30_60', rotulo: '30 a 60 min', cor: '#EA580C' },
  { chave: 'acima_60', rotulo: 'mais de 1 h', cor: '#DC2626' },
];

const CHAVE_FILTROS = 'chatgov_dashboard_filtros';
const INTERVALO_AUTO_MS = 60_000;

const CORES_SITUACAO = {
  NO_PRAZO: () => T.success,
  PROXIMO: () => T.warning,
  VENCIDO: () => T.danger,
};

function corSituacao(situacao) {
  return (CORES_SITUACAO[situacao] || CORES_SITUACAO.NO_PRAZO)();
}

// Filtros vêm da URL (link compartilhável) e caem no que ficou salvo da última
// visita — o gestor abre direto no recorte dele em vez de refazer tudo.
function filtrosIniciais() {
  const padrao = periodosRapidos()[3]; // 30 dias
  const base = { periodo: padrao.chave, inicio: padrao.inicio, fim: padrao.fim, departamentoId: '', canal: '' };
  let salvo = {};
  try { salvo = JSON.parse(localStorage.getItem(CHAVE_FILTROS) || '{}'); } catch { salvo = {}; }
  let url = {};
  try {
    const params = new URLSearchParams(window.location.search);
    url = {
      inicio: params.get('de') || undefined,
      fim: params.get('ate') || undefined,
      departamentoId: params.get('setor') || undefined,
      canal: params.get('atendimento') || undefined,
      periodo: params.get('de') ? 'personalizado' : undefined,
    };
  } catch { url = {}; }
  const limpo = Object.fromEntries(Object.entries({ ...salvo, ...url }).filter(([, v]) => v !== undefined && v !== null));
  return { ...base, ...limpo };
}

function CartaoKpi({
  titulo, valor, detalhe, icon: Icone, cor = T.primary, delta, deltaInvertido = false,
  situacao, onClick, dica,
}) {
  const deltaNumero = Number(delta);
  const temDelta = Number.isFinite(deltaNumero);
  const positivo = deltaInvertido ? deltaNumero <= 0 : deltaNumero >= 0;
  const clicavel = typeof onClick === 'function';

  return React.createElement(clicavel ? 'button' : 'article', {
    type: clicavel ? 'button' : undefined,
    onClick,
    className: clicavel ? 'cg-kpi-acionavel' : undefined,
    title: dica,
    style: {
      minWidth: 0, textAlign: 'left', font: 'inherit', width: '100%',
      background: T.surface,
      border: `1px solid ${situacao && situacao !== 'NO_PRAZO' ? corSituacao(situacao) : T.border}`,
      borderRadius: T.radiusLg,
      padding: 14,
      boxShadow: T.shadow,
      cursor: clicavel ? 'pointer' : 'default',
    },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 } },
      React.createElement('div', { style: { minWidth: 0 } },
        React.createElement('div', { style: { color: T.textSecondary, fontSize: 12, fontWeight: 700, marginBottom: 8 } }, titulo),
        React.createElement('div', { style: { color: T.text, fontSize: 28, lineHeight: 1, fontWeight: 800, letterSpacing: -0.6 } }, valor),
      ),
      React.createElement('div', {
        'aria-hidden': true,
        style: {
          width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
          background: `${situacao ? corSituacao(situacao) : cor}18`, color: situacao ? corSituacao(situacao) : cor, flexShrink: 0,
        },
      }, React.createElement(Icone, { size: 19 })),
    ),
    React.createElement('div', { style: { minHeight: 18, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, flexWrap: 'wrap' } },
      temDelta && React.createElement('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 2,
          color: positivo ? (T.primaryHover || T.primary) : T.dangerDark, fontWeight: 700,
        },
      },
        deltaNumero >= 0
          ? React.createElement(ArrowUpRight, { size: 13 })
          : React.createElement(ArrowDownRight, { size: 13 }),
        `${Math.abs(deltaNumero)}%`,
      ),
      React.createElement('span', { style: { color: T.textSecondary } }, detalhe),
      situacao && situacao !== 'NO_PRAZO' && React.createElement('span', {
        style: {
          color: corSituacao(situacao), fontWeight: 700, background: `${corSituacao(situacao)}18`,
          borderRadius: 10, padding: '1px 7px',
        },
      }, ROTULO_SITUACAO[situacao]),
    ),
  );
}

function CabecalhoPainel({ titulo, subtitulo, complemento }) {
  return React.createElement('div', {
    style: {
      padding: '17px 20px', borderBottom: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    },
  },
    React.createElement('div', null,
      React.createElement('h2', { style: { margin: 0, fontSize: 15, color: T.text } }, titulo),
      subtitulo && React.createElement('p', { style: { margin: '4px 0 0', fontSize: 11, color: T.textSecondary } }, subtitulo),
    ),
    complemento,
  );
}

function Painel({ children, style, erro, onTentarDeNovo }) {
  return React.createElement('section', {
    className: 'cg-painel',
    style: {
      minWidth: 0, background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radiusLg, boxShadow: T.shadow, overflow: 'hidden', ...style,
    },
  },
    children,
    // Falha de um painel não derruba os outros: antes, um erro em qualquer
    // chamada apagava a página inteira.
    erro && React.createElement('div', {
      role: 'status',
      style: { padding: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.dangerDark, background: T.dangerSoft },
    },
      erro,
      onTentarDeNovo && React.createElement('button', {
        type: 'button', onClick: onTentarDeNovo, className: 'nao-imprimir',
        style: { marginLeft: 'auto', border: `1px solid ${T.dangerDark}`, background: 'transparent', color: T.dangerDark, borderRadius: T.radiusSm, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 },
      }, 'Tentar de novo'),
    ),
  );
}

function EstadoVazioDashboard({ mensagem, dica }) {
  return React.createElement('div', { style: { padding: '34px 20px', textAlign: 'center' } },
    React.createElement('p', { style: { margin: 0, color: T.textSecondary, fontSize: 13, fontWeight: 700 } }, mensagem),
    dica && React.createElement('p', { style: { margin: '6px 0 0', color: T.textMuted, fontSize: 11 } }, dica),
  );
}

// Tabela só para leitor de tela e para a impressão: gráfico é desenho, e
// desenho sozinho exclui quem usa leitor e some no papel em preto e branco.
function TabelaAlternativa({ titulo, colunas, linhas, imprimir = false }) {
  if (!linhas || !linhas.length) return null;
  return React.createElement('table', {
    // Sempre disponível para leitor de tela; no papel só entra quando substitui
    // um gráfico que não imprime bem — senão o relatório vira lista de zeros.
    className: `cg-tabela-dados${imprimir ? ' cg-tabela-imprimir' : ''}`,
    summary: titulo,
  },
    React.createElement('caption', null, titulo),
    React.createElement('thead', null,
      React.createElement('tr', null, colunas.map((coluna) => React.createElement('th', { key: coluna, scope: 'col' }, coluna))),
    ),
    React.createElement('tbody', null,
      linhas.map((linha, i) => React.createElement('tr', { key: i },
        linha.map((celula, j) => React.createElement(j === 0 ? 'th' : 'td', { key: j, scope: j === 0 ? 'row' : undefined }, celula)),
      )),
    ),
  );
}

function GraficoLinha({ dados, anterior }) {
  const lista = dados || [];
  const maximo = Math.max(...lista.map((item) => Number(item.total) || 0), ...(anterior || []).map((item) => Number(item.total) || 0), 1);
  if (!lista.length) {
    return React.createElement(EstadoVazioDashboard, {
      mensagem: 'Sem conversas no período',
      dica: 'Escolha outro intervalo ou remova os filtros.',
    });
  }
  const pontos = (serie) => serie.map((item, indice) => {
    const x = lista.length > 1 ? (indice / (lista.length - 1)) * 100 : 50;
    const y = 100 - ((Number(item.total) || 0) / maximo) * 88;
    return `${x},${y}`;
  }).join(' ');

  return React.createElement('div', { style: { padding: '18px 20px 12px' } },
    React.createElement('svg', {
      viewBox: '0 0 100 100', preserveAspectRatio: 'none', role: 'img',
      'aria-label': `Conversas por dia. Máximo de ${maximo} em um dia.`,
      style: { width: '100%', height: 168, overflow: 'visible' },
    },
      anterior && anterior.length > 1 && React.createElement('polyline', {
        points: pontos(anterior), fill: 'none', stroke: T.textMuted, strokeWidth: 0.6,
        strokeDasharray: '2 2', vectorEffect: 'non-scaling-stroke', opacity: 0.9,
      }),
      React.createElement('polyline', {
        points: pontos(lista), fill: 'none', stroke: T.primary, strokeWidth: 1.6,
        vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round',
      }),
    ),
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: T.textSecondary } },
      React.createElement('span', null, formatarDataCurta(lista[0]?.dia)),
      React.createElement('span', null, formatarDataCurta(lista[lista.length - 1]?.dia)),
    ),
    anterior && anterior.length > 1 && React.createElement('div', {
      style: { display: 'flex', gap: 14, marginTop: 8, fontSize: 10, color: T.textSecondary },
    },
      React.createElement('span', null, '— período atual'),
      React.createElement('span', null, '- - período anterior'),
    ),
    React.createElement(TabelaAlternativa, {
      titulo: 'Conversas por dia',
      colunas: ['Dia', 'Conversas'],
      linhas: lista.map((item) => [formatarDataBr(item.dia), String(Number(item.total) || 0)]),
    }),
  );
}

function Barras({ dados, vazio, sufixo = '', onSelecionar }) {
  const lista = dados || [];
  if (!lista.length) return React.createElement(EstadoVazioDashboard, { mensagem: vazio });
  const maximo = Math.max(...lista.map((item) => Number(item.total ?? item.minutos ?? item.enviadas) || 0), 1);
  return React.createElement('div', { style: { padding: '18px 20px', display: 'grid', gap: 12 } },
    lista.map((item) => {
      const valor = Number(item.total ?? item.minutos ?? item.enviadas) || 0;
      const rotulo = item.nome || item.assunto || `${item.hora}h`;
      const acionavel = typeof onSelecionar === 'function' && item.id;
      return React.createElement(acionavel ? 'button' : 'div', {
        key: rotulo,
        type: acionavel ? 'button' : undefined,
        onClick: acionavel ? () => onSelecionar(item) : undefined,
        className: acionavel ? 'cg-barra-acionavel' : undefined,
        style: {
          border: 'none', background: 'transparent', padding: 0, width: '100%',
          textAlign: 'left', font: 'inherit', cursor: acionavel ? 'pointer' : 'default',
        },
      },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, fontSize: 12 } },
          React.createElement('span', { style: { color: T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, rotulo),
          React.createElement('strong', { style: { color: T.text } }, `${valor}${sufixo}`),
        ),
        React.createElement('div', { style: { height: 7, borderRadius: 8, background: T.surfaceMuted, overflow: 'hidden' } },
          React.createElement('div', {
            style: { width: `${Math.max(4, (valor / maximo) * 100)}%`, height: '100%', borderRadius: 8, background: T.primary },
          }),
        ),
      );
    }),
  );
}

function StatusConversas({ dados, onSelecionar }) {
  const lista = dados || [];
  const total = lista.reduce((soma, item) => soma + (Number(item.total ?? item.count) || 0), 0);
  if (!total) {
    return React.createElement(EstadoVazioDashboard, {
      mensagem: 'Nenhuma conversa registrada',
      dica: 'A distribuição por status será exibida após o primeiro atendimento.',
    });
  }
  return React.createElement('div', { style: { padding: '18px 20px', display: 'grid', gap: 12 } },
    lista.map((item) => {
      const valor = Number(item.total ?? item.count) || 0;
      const percentual = Math.round((valor / total) * 100);
      const destino = STATUS_DRILL[item.status];
      const acionavel = typeof onSelecionar === 'function' && destino;
      return React.createElement(acionavel ? 'button' : 'div', {
        key: item.status,
        type: acionavel ? 'button' : undefined,
        onClick: acionavel ? () => onSelecionar(destino) : undefined,
        className: acionavel ? 'cg-barra-acionavel' : undefined,
        style: {
          border: 'none', background: 'transparent', padding: 0, width: '100%',
          textAlign: 'left', font: 'inherit', cursor: acionavel ? 'pointer' : 'default',
        },
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
            React.createElement('span', { 'aria-hidden': true, style: { width: 9, height: 9, borderRadius: '50%', background: STATUS_CORES[item.status] || T.textMuted } }),
            React.createElement('span', { style: { color: T.textSecondary, fontSize: 12 } }, STATUS_LABELS[item.status] || item.status),
          ),
          React.createElement('strong', { style: { color: T.text, fontSize: 12 } }, `${valor} · ${percentual}%`),
        ),
        React.createElement('div', { style: { height: 7, borderRadius: 7, background: T.surfaceMuted, overflow: 'hidden' } },
          React.createElement('div', {
            style: { height: '100%', width: `${percentual}%`, borderRadius: 7, background: STATUS_CORES[item.status] || T.textMuted },
          }),
        ),
      );
    }),
  );
}

function EsperaDaFila({ fila, meta, onAbrirFila }) {
  const total = Number(fila?.total) || 0;
  if (!total) {
    return React.createElement(EstadoVazioDashboard, {
      mensagem: 'Ninguém esperando agora',
      dica: 'Toda conversa recebida já está com um atendente ou resolvida.',
    });
  }
  const faixas = fila.faixas || {};
  return React.createElement('div', { style: { padding: '18px 20px', display: 'grid', gap: 12 } },
    FAIXAS_FILA.map((faixa) => {
      const valor = Number(faixas[faixa.chave]) || 0;
      const percentual = Math.round((valor / total) * 100);
      return React.createElement('div', { key: faixa.chave },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, fontSize: 12 } },
          React.createElement('span', { style: { color: T.textSecondary } }, faixa.rotulo),
          React.createElement('strong', { style: { color: T.text } }, `${valor}`),
        ),
        React.createElement('div', { style: { height: 7, borderRadius: 8, background: T.surfaceMuted, overflow: 'hidden' } },
          React.createElement('div', { style: { width: `${Math.max(valor ? 4 : 0, percentual)}%`, height: '100%', borderRadius: 8, background: faixa.cor } }),
        ),
      );
    }),
    fila.mais_antiga && React.createElement('div', {
      style: {
        marginTop: 4, padding: '10px 12px', borderRadius: T.radiusSm,
        background: T.surfaceMuted, fontSize: 12, color: T.textSecondary,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      },
    },
      React.createElement(AlarmClock, { size: 15, color: corSituacao(fila.situacao) }),
      React.createElement('span', null,
        'Espera mais longa: ',
        React.createElement('strong', { style: { color: T.text } }, fila.mais_antiga.contato || 'cidadão'),
        ` — ${formatarTempo(fila.mais_antiga.espera_seg)}`,
        fila.mais_antiga.departamento ? ` (${fila.mais_antiga.departamento})` : '',
      ),
      onAbrirFila && React.createElement('button', {
        type: 'button', onClick: onAbrirFila, className: 'nao-imprimir',
        style: {
          marginLeft: 'auto', border: `1px solid ${T.borderStrong}`, background: T.surface,
          color: T.text, borderRadius: T.radiusSm, padding: '4px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 11,
        },
      }, 'Abrir fila'),
    ),
    React.createElement('p', { style: { margin: 0, fontSize: 11, color: T.textMuted } },
      `Meta de primeira resposta: ${meta?.primeira_resposta_minutos || 30} min · ${fila.fora_da_meta || 0} acima da meta · ${fila.sem_primeira_resposta || 0} sem nenhuma resposta humana.`),
  );
}

function ListaOperadores({ operadores }) {
  const lista = operadores || [];
  if (!lista.length) {
    return React.createElement(EstadoVazioDashboard, {
      mensagem: 'Nenhum operador cadastrado',
      dica: 'Cadastre a equipe para acompanhar disponibilidade e carga.',
    });
  }
  return React.createElement('div', { style: { padding: '4px 0' } },
    lista.slice(0, 6).map((operador) => React.createElement('div', {
      key: operador.id,
      style: {
        minHeight: 51, padding: '0 20px', display: 'flex', alignItems: 'center',
        gap: 10, borderBottom: `1px solid ${T.border}`,
      },
    },
      React.createElement('span', {
        role: 'img', 'aria-label': operador.online ? 'Online' : 'Offline',
        style: { width: 9, height: 9, borderRadius: '50%', background: operador.online ? T.online : T.offline, flexShrink: 0 },
      }),
      React.createElement('span', { style: { flex: 1, minWidth: 0, color: T.text, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, operador.nome),
      React.createElement('span', {
        style: { color: T.textSecondary, background: T.surfaceMuted, borderRadius: 16, padding: '3px 8px', fontSize: 10, fontWeight: 700 },
      }, operador.status_atendente || 'disponível'),
      React.createElement('span', { style: { color: T.textSecondary, fontSize: 10 } }, `Carga ${operador.carga || 0}`),
    )),
  );
}

const ESTILO_DASHBOARD = () => `
.cg-kpi-acionavel:hover, .cg-barra-acionavel:hover { filter: brightness(0.985); }
.cg-kpi-acionavel:focus-visible, .cg-barra-acionavel:focus-visible { outline: 2px solid ${T.primary}; outline-offset: 2px; }
.cg-tabela-dados { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.cg-tabela-dados caption { text-align: left; font-weight: 700; padding-bottom: 4px; }
.cg-so-impressao { display: none; }
@media print {
  .nao-imprimir { display: none !important; }
  body * { visibility: hidden; }
  #dashboard-root, #dashboard-root * { visibility: visible; }
  #dashboard-root { position: absolute; left: 0; top: 0; width: 100%; padding: 0; overflow: visible !important; background: #fff; }
  .cg-so-impressao { display: block !important; }
  .cg-painel { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
  .cg-tabela-imprimir { position: static; width: auto; height: auto; clip: auto; white-space: normal; border-collapse: collapse; font-size: 10pt; margin: 8px 20px 16px; }
  .cg-tabela-imprimir th, .cg-tabela-imprimir td { border: 1px solid #999; padding: 3px 6px; text-align: left; }
  .cg-grafico-tela { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { size: A4 portrait; margin: 12mm; }
}
`;

export function PaginaDashboard({ breakpoint, onDrillDown }) {
  const { auth } = useAuth();
  const [filtros, setFiltros] = useState(filtrosIniciais);
  const { periodo, inicio, fim, departamentoId, canal } = filtros;
  const [metricas, setMetricas] = useState(null);
  const [administrativo, setAdministrativo] = useState(null);
  const [departamentos, setDepartamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroMetricas, setErroMetricas] = useState('');
  const [erroPainel, setErroPainel] = useState('');
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [autoAtualizar, setAutoAtualizar] = useState(() => {
    try { return localStorage.getItem('chatgov_dashboard_auto') !== 'off'; } catch { return true; }
  });
  const [exportando, setExportando] = useState(false);
  const requisicaoRef = useRef(null);
  const ehMobile = breakpoint === 'mobile';

  const atualizarFiltros = useCallback((mudanca) => {
    setFiltros((atual) => ({ ...atual, ...mudanca }));
  }, []);

  // Guarda o recorte e reflete na URL: o link aberto pelo secretário mostra
  // exatamente o que o gestor estava vendo.
  useEffect(() => {
    try { localStorage.setItem(CHAVE_FILTROS, JSON.stringify(filtros)); } catch { /* modo privado */ }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('de', inicio);
      url.searchParams.set('ate', fim);
      if (departamentoId) url.searchParams.set('setor', departamentoId); else url.searchParams.delete('setor');
      if (canal) url.searchParams.set('atendimento', canal); else url.searchParams.delete('atendimento');
      window.history.replaceState({}, '', url);
    } catch { /* sem history */ }
  }, [filtros, inicio, fim, departamentoId, canal]);

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    requisicaoRef.current?.abort();
    const controller = new AbortController();
    requisicaoRef.current = controller;
    if (!silencioso) setCarregando(true);

    const opcoes = { departamentoId, canal, signal: controller.signal };
    const [resMetricas, resPainel, resDeps] = await Promise.allSettled([
      fetchRelatorioMetricas(inicio, fim, { ...opcoes, comparar: true }),
      fetchDashboard({ inicio, fim, departamentoId, canal, signal: controller.signal }),
      fetchDepartamentos({ signal: controller.signal }),
    ]);

    // Resposta de um filtro antigo não sobrescreve a tela do filtro atual.
    if (controller.signal.aborted) return;

    if (resMetricas.status === 'fulfilled') {
      setMetricas(resMetricas.value);
      setErroMetricas('');
    } else if (resMetricas.reason?.name !== 'AbortError') {
      setErroMetricas(resMetricas.reason?.message || 'Não foi possível carregar os indicadores do período.');
    }
    if (resPainel.status === 'fulfilled') {
      setAdministrativo(resPainel.value);
      setErroPainel('');
    } else if (resPainel.reason?.name !== 'AbortError') {
      setErroPainel(resPainel.reason?.message || 'Não foi possível carregar a situação atual.');
    }
    if (resDeps.status === 'fulfilled') setDepartamentos(resDeps.value || []);

    setAtualizadoEm(new Date());
    setCarregando(false);
  }, [inicio, fim, departamentoId, canal]);

  useEffect(() => { carregar(); return () => requisicaoRef.current?.abort(); }, [carregar]);

  // Atualização automática: painel operacional que envelhece na tela leva a
  // decisão errada. Pausa com a aba escondida para não bater na API à toa.
  useEffect(() => {
    if (!autoAtualizar) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') carregar({ silencioso: true });
    }, INTERVALO_AUTO_MS);
    return () => clearInterval(id);
  }, [autoAtualizar, carregar]);

  useEffect(() => {
    try { localStorage.setItem('chatgov_dashboard_auto', autoAtualizar ? 'on' : 'off'); } catch { /* modo privado */ }
  }, [autoAtualizar]);

  const selecionarPeriodo = (item) => atualizarFiltros({ periodo: item.chave, inicio: item.inicio, fim: item.fim });

  const resumo = metricas?.resumo || {};
  const comparacao = metricas?.comparacao || {};
  const nps = metricas?.nps?.nps;
  const fila = administrativo?.fila || {};
  const metas = administrativo?.metas || {};
  const atendimento = administrativo?.atendimento || {};
  const departamentoNome = useMemo(
    () => departamentos.find((item) => item.id === departamentoId)?.nome || '',
    [departamentos, departamentoId],
  );
  const canalRotulo = CANAIS.find((item) => item.valor === canal && item.valor)?.rotulo || '';
  const online = useMemo(
    () => (administrativo?.operadores_online || []).filter((item) => item.online).length,
    [administrativo],
  );
  const maxHora = useMemo(
    () => Math.max(...(metricas?.por_hora || []).map((item) => Number(item.total) || 0), 1),
    [metricas],
  );
  const situacaoPrimeiraResposta = situacaoMeta(
    resumo.tempo_primeira_resposta_seg, metas.primeira_resposta_minutos, metas.alerta_percentual,
  );
  const contextoExport = {
    inicio, fim, departamentoNome, canalRotulo,
    orgao: auth?.operador?.tenantNome || 'Órgão',
    emitidoPor: auth?.operador?.nome || '—',
    emitidoEm: new Date().toLocaleString('pt-BR'),
  };

  const exportar = async (formato) => {
    if (!metricas && !administrativo) return;
    setExportando(true);
    try {
      // A exportação é registrada em auditoria: dado de atendimento saindo do
      // sistema precisa deixar rastro de quem levou e com que recorte.
      await registrarExportacaoRelatorio(formato, { inicio, fim }, { departamento_id: departamentoId || null, canal: canal || null })
        .catch(() => { /* auditoria indisponível não bloqueia o gestor */ });
      const blocos = matrizesDashboard({ metricas, administrativo }, contextoExport);
      const base = nomeArquivoExport('painel-operacional', inicio, fim);
      if (formato === 'csv') {
        const linhas = blocos.flatMap((bloco) => [[bloco.nome], ...bloco.linhas, []]);
        baixarArquivo(montarCsv(linhas), `${base}.csv`, 'text/csv;charset=utf-8');
      } else {
        const { createXlsx } = await import('../utils/xlsx');
        const arquivo = createXlsx(blocos.map((bloco) => ({ name: bloco.nome.slice(0, 28), rows: bloco.linhas })));
        baixarArquivo(arquivo, `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    } finally {
      setExportando(false);
    }
  };

  const imprimir = async () => {
    await registrarExportacaoRelatorio('impressao', { inicio, fim }, { departamento_id: departamentoId || null, canal: canal || null })
      .catch(() => { /* idem */ });
    window.print();
  };

  const irPara = (filtro) => { if (typeof onDrillDown === 'function') onDrillDown(filtro); };

  const inputStyle = {
    minHeight: 40, border: `1px solid ${T.borderStrong}`, borderRadius: T.radiusSm,
    background: T.surface, color: T.text, padding: '0 11px', fontSize: 12, boxSizing: 'border-box',
  };
  const botaoStyle = {
    minHeight: 40, padding: '0 13px', border: `1px solid ${T.borderStrong}`,
    borderRadius: T.radiusSm, background: T.surface, color: T.textSecondary,
    display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12,
  };

  return React.createElement('main', {
    id: 'dashboard-root',
    'aria-labelledby': 'dashboard-titulo',
    style: { flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', background: T.bg },
  },
    React.createElement('style', null, ESTILO_DASHBOARD()),

    React.createElement('header', {
      className: 'nao-imprimir',
      style: {
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: ehMobile ? '18px 16px' : '22px 32px 18px',
      },
    },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' } },
        React.createElement('div', null,
          React.createElement('h1', { id: 'dashboard-titulo', style: { margin: 0, fontSize: ehMobile ? 22 : 24, letterSpacing: -0.6 } }, 'Dashboard operacional'),
          React.createElement('p', { style: { margin: '5px 0 0', color: T.textSecondary, fontSize: 13 } }, 'Acompanhe demanda, desempenho da equipe e qualidade do atendimento.'),
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          atualizadoEm && React.createElement('span', { style: { color: T.textSecondary, fontSize: 11 } },
            `Atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`),
          React.createElement('label', {
            style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.textSecondary, cursor: 'pointer' },
            title: 'Recarrega os indicadores a cada minuto enquanto esta aba estiver visível',
          },
            React.createElement('input', {
              type: 'checkbox', checked: autoAtualizar, onChange: (e) => setAutoAtualizar(e.target.checked),
            }),
            'Atualizar sozinho',
          ),
          React.createElement('button', {
            type: 'button', onClick: () => exportar('csv'), disabled: exportando || carregando,
            title: 'Baixar os números do período em CSV', style: botaoStyle,
          }, React.createElement(FileText, { size: 15 }), 'CSV'),
          React.createElement('button', {
            type: 'button', onClick: () => exportar('xlsx'), disabled: exportando || carregando,
            title: 'Baixar os números do período em Excel', style: botaoStyle,
          }, React.createElement(FileSpreadsheet, { size: 15 }), 'Excel'),
          React.createElement('button', {
            type: 'button', onClick: imprimir, disabled: carregando,
            title: 'Imprimir ou salvar em PDF', style: botaoStyle,
          }, React.createElement(Printer, { size: 15 }), 'Imprimir'),
          React.createElement('button', {
            type: 'button', onClick: () => carregar(), disabled: carregando,
            'aria-label': 'Atualizar dados do dashboard',
            style: { ...botaoStyle, cursor: carregando ? 'wait' : 'pointer' },
          }, React.createElement(RefreshCw, { size: 16, className: carregando ? 'spin' : undefined }), 'Atualizar'),
        ),
      ),
      React.createElement('div', {
        'aria-label': 'Filtros do dashboard',
        style: { marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      },
        React.createElement('div', { style: { display: 'flex', gap: 3, padding: 3, background: T.surfaceMuted, borderRadius: 10, flexWrap: 'wrap' } },
          periodosRapidos().map((item) => React.createElement('button', {
            key: item.chave, type: 'button', onClick: () => selecionarPeriodo(item),
            'aria-pressed': periodo === item.chave,
            style: {
              minHeight: 34, padding: '0 12px', border: 'none', borderRadius: 8,
              background: periodo === item.chave ? T.surface : 'transparent',
              color: periodo === item.chave ? (T.primaryHover || T.primary) : T.textMuted,
              boxShadow: periodo === item.chave ? T.shadow : 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            },
          }, item.rotulo)),
        ),
        React.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textSecondary, fontSize: 11 } },
          'De',
          React.createElement('input', {
            type: 'date', value: inicio, max: fim,
            onChange: (e) => atualizarFiltros({ periodo: 'personalizado', inicio: e.target.value }),
            'aria-label': 'Data inicial', style: inputStyle,
          }),
        ),
        React.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textSecondary, fontSize: 11 } },
          'Até',
          React.createElement('input', {
            type: 'date', value: fim, min: inicio, max: dataLocal(),
            onChange: (e) => atualizarFiltros({ periodo: 'personalizado', fim: e.target.value }),
            'aria-label': 'Data final', style: inputStyle,
          }),
        ),
        React.createElement('select', {
          value: departamentoId, onChange: (e) => atualizarFiltros({ departamentoId: e.target.value }),
          'aria-label': 'Filtrar por departamento', style: { ...inputStyle, maxWidth: ehMobile ? '100%' : 210 },
        },
          React.createElement('option', { value: '' }, 'Todos os departamentos'),
          departamentos.map((item) => React.createElement('option', { key: item.id, value: item.id }, item.nome)),
        ),
        React.createElement('select', {
          value: canal, onChange: (e) => atualizarFiltros({ canal: e.target.value }),
          'aria-label': 'Filtrar por tipo de atendimento', style: inputStyle,
        },
          CANAIS.map((item) => React.createElement('option', { key: item.valor || 'todos', value: item.valor }, item.rotulo)),
        ),
      ),
    ),

    React.createElement('div', { style: { padding: ehMobile ? 16 : 32, maxWidth: 1680, margin: '0 auto', boxSizing: 'border-box' } },
      // Cabeçalho institucional: só aparece no papel/PDF, com a procedência que
      // um documento de prestação de contas precisa ter.
      React.createElement('div', { className: 'cg-so-impressao', style: { marginBottom: 16, borderBottom: `2px solid ${T.text}`, paddingBottom: 10 } },
        React.createElement('h1', { style: { margin: 0, fontSize: 18 } }, contextoExport.orgao),
        React.createElement('p', { style: { margin: '4px 0 0', fontSize: 13, fontWeight: 700 } }, 'Painel operacional de atendimento — ChatGov'),
        React.createElement('p', { style: { margin: '4px 0 0', fontSize: 11 } }, descreverFiltros(contextoExport)),
        React.createElement('p', { style: { margin: '2px 0 0', fontSize: 11 } }, `Emitido em ${contextoExport.emitidoEm} por ${contextoExport.emitidoPor}`),
      ),

      carregando && !metricas && !administrativo
        ? React.createElement('div', { role: 'status', style: { padding: 40, textAlign: 'center', color: T.textMuted } }, 'Carregando indicadores…')
        : React.createElement(React.Fragment, null,
          // ── Agora ────────────────────────────────────────────────
          React.createElement('h2', { style: { margin: '0 0 10px', fontSize: 13, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 } },
            'Agora'),
          erroPainel && React.createElement('div', {
            role: 'alert',
            style: { marginBottom: 14, padding: 12, borderRadius: T.radius, background: T.dangerSoft, color: T.dangerDark, fontSize: 12, display: 'flex', gap: 10, alignItems: 'center' },
          },
            erroPainel,
            React.createElement('button', {
              type: 'button', onClick: () => carregar(), className: 'nao-imprimir',
              style: { marginLeft: 'auto', border: `1px solid ${T.dangerDark}`, background: 'transparent', color: T.dangerDark, borderRadius: T.radiusSm, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 },
            }, 'Tentar de novo'),
          ),
          React.createElement('section', {
            'aria-label': 'Situação no momento',
            style: {
              display: 'grid', gridTemplateColumns: ehMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: ehMobile ? 10 : 14, marginBottom: 22,
            },
          },
            React.createElement(CartaoKpi, {
              titulo: 'Aguardando atendimento', valor: fila.total ?? resumo.na_fila ?? 0,
              detalhe: fila.fora_da_meta ? `${fila.fora_da_meta} acima da meta` : 'na fila agora',
              icon: Inbox, cor: T.warning, situacao: fila.situacao,
              onClick: () => irPara('fila'), dica: 'Abrir a fila na lista de conversas',
            }),
            React.createElement(CartaoKpi, {
              titulo: 'Espera mais longa', valor: formatarTempo(fila.maior_espera_seg || 0),
              detalhe: fila.mais_antiga?.contato ? `${fila.mais_antiga.contato} aguardando` : 'sem ninguém na fila',
              icon: Hourglass, situacao: fila.situacao,
              onClick: () => irPara('fila'), dica: 'Abrir a fila na lista de conversas',
            }),
            React.createElement(CartaoKpi, {
              titulo: 'Sem resposta humana', valor: fila.sem_primeira_resposta ?? 0,
              detalhe: 'nenhum atendente respondeu ainda', icon: Timer,
              cor: T.danger, onClick: () => irPara('sem_responsavel'), dica: 'Ver conversas sem responsável',
            }),
            React.createElement(CartaoKpi, {
              titulo: 'Em atendimento', valor: resumo.em_aberto || 0, detalhe: 'conversas ativas',
              icon: Headphones, cor: '#7C3AED',
              onClick: () => irPara('em_atendimento'), dica: 'Ver conversas em atendimento',
            }),
            React.createElement(CartaoKpi, {
              titulo: 'Equipe online', valor: online,
              detalhe: `de ${(administrativo?.operadores_online || []).length} cadastrados`, icon: Users, cor: T.success,
            }),
          ),

          // ── Período ──────────────────────────────────────────────
          React.createElement('h2', { style: { margin: '0 0 10px', fontSize: 13, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 } },
            ehMobile ? 'No período' : `No período · ${descreverFiltros({ inicio, fim, departamentoNome, canalRotulo })}`),
          erroMetricas && React.createElement('div', {
            role: 'alert',
            style: { marginBottom: 14, padding: 12, borderRadius: T.radius, background: T.dangerSoft, color: T.dangerDark, fontSize: 12, display: 'flex', gap: 10, alignItems: 'center' },
          },
            erroMetricas,
            React.createElement('button', {
              type: 'button', onClick: () => carregar(), className: 'nao-imprimir',
              style: { marginLeft: 'auto', border: `1px solid ${T.dangerDark}`, background: 'transparent', color: T.dangerDark, borderRadius: T.radiusSm, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 },
            }, 'Tentar de novo'),
          ),
          React.createElement('section', {
            'aria-label': 'Indicadores do período',
            style: {
              display: 'grid', gridTemplateColumns: ehMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: ehMobile ? 10 : 14, marginBottom: 18,
            },
          },
            React.createElement(CartaoKpi, { titulo: 'Conversas criadas', valor: resumo.criadas || 0, detalhe: 'vs. período anterior', icon: MessageCircle, delta: comparacao.delta_criadas }),
            React.createElement(CartaoKpi, { titulo: 'Taxa de resolução', valor: `${resumo.taxa_resolucao || 0}%`, detalhe: 'vs. período anterior', icon: CheckCircle2, cor: T.success, delta: comparacao.delta_taxa_resolucao }),
            React.createElement(CartaoKpi, {
              titulo: 'Primeira resposta', valor: formatarTempo(resumo.tempo_primeira_resposta_seg),
              detalhe: `meta ${metas.primeira_resposta_minutos || 30} min`, icon: Clock3,
              delta: comparacao.delta_tempo_resposta, deltaInvertido: true, situacao: situacaoPrimeiraResposta,
            }),
            React.createElement(CartaoKpi, {
              titulo: 'Resolvido pela Iris', valor: `${atendimento.percentual_bot || 0}%`,
              detalhe: `${atendimento.respostas_bot || 0} respostas da assistente`, icon: Bot, cor: '#0891B2',
            }),
            React.createElement(CartaoKpi, { titulo: 'NPS', valor: Number.isFinite(Number(nps)) ? Math.round(nps) : '—', detalhe: 'satisfação do cidadão', icon: Star, cor: T.warning }),
          ),

          React.createElement('div', {
            style: { display: 'grid', gridTemplateColumns: ehMobile ? '1fr' : 'minmax(0, 1.65fr) minmax(300px, 1fr)', gap: 18, marginBottom: 18 },
          },
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, {
                titulo: 'Volume de atendimentos',
                subtitulo: 'Linha cheia: período selecionado. Tracejada: período anterior.',
              }),
              React.createElement(GraficoLinha, { dados: metricas?.por_dia, anterior: metricas?.por_dia_anterior }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Conversas por status', subtitulo: 'Clique para abrir a lista filtrada' }),
              React.createElement(StatusConversas, { dados: metricas?.por_status, onSelecionar: irPara }),
            ),
          ),

          React.createElement('div', {
            style: { display: 'grid', gridTemplateColumns: ehMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 18, marginBottom: 18 },
          },
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, {
                titulo: 'Fila por tempo de espera',
                subtitulo: 'Quem está esperando agora, e há quanto tempo',
                complemento: React.createElement('span', {
                  style: { color: corSituacao(fila.situacao), fontSize: 11, fontWeight: 700 },
                }, ROTULO_SITUACAO[fila.situacao] || ''),
              }),
              React.createElement(EsperaDaFila, { fila, meta: metas, onAbrirFila: () => irPara('fila') }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Demanda por departamento', subtitulo: 'Clique em um setor para abrir a lista' }),
              React.createElement(Barras, {
                dados: (metricas?.por_setor || []).map((item) => ({
                  ...item, id: departamentos.find((d) => d.nome === item.nome)?.id || null,
                })),
                vazio: 'Sem dados por departamento',
                onSelecionar: (item) => irPara(item.id),
              }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, {
                titulo: 'Equipe em operação',
                subtitulo: 'Disponibilidade e carga atual',
                complemento: React.createElement('span', { style: { color: T.textSecondary, fontSize: 11, fontWeight: 700 } }, `${online} online`),
              }),
              React.createElement(ListaOperadores, { operadores: administrativo?.operadores_online }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Ranking de atendentes', subtitulo: 'Mensagens enviadas no período' }),
              React.createElement(Barras, {
                dados: (metricas?.ranking_atendentes || []).map((item) => ({ nome: item.nome, total: item.enviadas })),
                vazio: 'Nenhum atendimento humano no período',
              }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Assuntos mais frequentes', subtitulo: 'Protocolos abertos no período' }),
              React.createElement(Barras, { dados: administrativo?.top_assuntos, vazio: 'Ainda não há assuntos suficientes' }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Tempo médio de conclusão', subtitulo: 'Protocolos concluídos no período, por setor' }),
              React.createElement(Barras, { dados: administrativo?.tma_por_setor, vazio: 'Nenhum protocolo concluído no período', sufixo: ' min' }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Horários de maior demanda', subtitulo: 'Mensagens recebidas por hora (horário local)' }),
              (metricas?.por_hora || []).some((item) => Number(item.total) > 0)
                ? React.createElement('div', null,
                    React.createElement('div', {
                      className: 'cg-grafico-tela',
                      role: 'img',
                      'aria-label': 'Mensagens recebidas por hora do dia',
                      style: { height: 172, padding: '20px 20px 16px', display: 'flex', alignItems: 'flex-end', gap: 5 },
                    },
                      Array.from({ length: 24 }, (_, hora) => {
                        const item = (metricas?.por_hora || []).find((registro) => Number(registro.hora) === hora);
                        const valor = Number(item?.total) || 0;
                        return React.createElement('div', {
                          key: hora, title: `${hora}h: ${valor} mensagem(ns)`,
                          style: { flex: 1, minWidth: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 5 },
                        },
                          React.createElement('div', {
                            style: {
                              height: `${Math.max(3, (valor / maxHora) * 100)}%`, minHeight: 3,
                              borderRadius: '4px 4px 2px 2px', background: valor ? T.primary : T.surfaceMuted,
                            },
                          }),
                          hora % 6 === 0 && React.createElement('span', { style: { color: T.textSecondary, fontSize: 9, textAlign: 'center' } }, `${hora}h`),
                        );
                      }),
                    ),
                    React.createElement(TabelaAlternativa, {
                      titulo: 'Mensagens recebidas por hora',
                      imprimir: true,
                      colunas: ['Hora', 'Mensagens'],
                      linhas: (metricas?.por_hora || []).filter((item) => Number(item.total) > 0)
                        .map((item) => [`${item.hora}h`, String(Number(item.total) || 0)]),
                    }),
                  )
                : React.createElement(EstadoVazioDashboard, {
                    mensagem: 'Sem demanda por horário',
                    dica: 'O gráfico será preenchido quando houver mensagens recebidas.',
                  }),
            ),
          ),

          React.createElement('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 8, color: T.textSecondary,
              fontSize: 11, padding: '2px 2px 10px',
            },
          }, React.createElement(Activity, { size: 14 }),
            `Indicadores do atendimento registrado no período, no horário local. Meta de primeira resposta: ${metas.primeira_resposta_minutos || 30} min (${metas.origem === 'departamento' ? 'definida para o setor' : metas.origem === 'tenant' ? 'definida para o órgão' : 'padrão do sistema'}).`),
        ),
    ),
  );
}

export default PaginaDashboard;
