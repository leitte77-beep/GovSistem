import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bot, CheckCircle2,
  Clock3, Headphones, Inbox, MessageCircle, RefreshCw, Star, Users,
} from 'lucide-react';
import { fetchDashboard, fetchDepartamentos, fetchRelatorioMetricas } from '../api';
import { T } from '../theme';

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

function dataLocal(date = new Date()) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function inicioPeriodo(dias) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, dias - 1));
  return dataLocal(date);
}

function formatarTempo(segundos) {
  const total = Number(segundos) || 0;
  if (total < 60) return `${total}s`;
  const minutos = Math.round(total / 60);
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

function formatarDataCurta(valor) {
  if (!valor) return '';
  const [, mes, dia] = valor.split('-');
  return `${dia}/${mes}`;
}

function CartaoKpi({ titulo, valor, detalhe, icon: Icone, cor = T.primary, delta, deltaInvertido = false }) {
  const deltaNumero = Number(delta);
  const temDelta = Number.isFinite(deltaNumero);
  const positivo = deltaInvertido ? deltaNumero <= 0 : deltaNumero >= 0;

  return React.createElement('article', {
    style: {
      minWidth: 0,
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: T.radiusLg,
      padding: 18,
      boxShadow: T.shadow,
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
          background: `${cor}18`, color: cor, flexShrink: 0,
        },
      }, React.createElement(Icone, { size: 19 })),
    ),
    React.createElement('div', { style: { minHeight: 18, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 } },
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

function Painel({ children, style }) {
  return React.createElement('section', {
    style: {
      minWidth: 0, background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radiusLg, boxShadow: T.shadow, overflow: 'hidden', ...style,
    },
  }, children);
}

function EstadoVazioDashboard({ mensagem, dica }) {
  return React.createElement('div', {
    style: { minHeight: 150, padding: 24, display: 'grid', placeItems: 'center', textAlign: 'center' },
  },
    React.createElement('div', null,
      React.createElement(BarChart3, { size: 26, color: T.textMuted, 'aria-hidden': true }),
      React.createElement('div', { style: { marginTop: 9, color: T.textSecondary, fontSize: 13, fontWeight: 700 } }, mensagem),
      React.createElement('div', { style: { marginTop: 4, color: T.textSecondary, fontSize: 11 } }, dica),
    ),
  );
}

function GraficoLinha({ dados }) {
  const pontos = dados || [];
  if (!pontos.some((item) => Number(item.total) > 0)) {
    return React.createElement(EstadoVazioDashboard, {
      mensagem: 'Sem atendimentos no período',
      dica: 'Ajuste os filtros ou aguarde a entrada de novas conversas.',
    });
  }
  const largura = 720;
  const altura = 180;
  const margem = 18;
  const maximo = Math.max(...pontos.map((p) => Number(p.total) || 0), 1);
  const coords = pontos.map((p, i) => {
    const x = margem + (i * (largura - margem * 2)) / Math.max(pontos.length - 1, 1);
    const y = altura - margem - ((Number(p.total) || 0) / maximo) * (altura - margem * 2);
    return { x, y, ...p };
  });
  const linha = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${margem},${altura - margem} ${linha} ${largura - margem},${altura - margem}`;
  const indicesRotulo = Array.from(new Set([0, Math.floor((pontos.length - 1) / 2), pontos.length - 1]));

  return React.createElement('div', { style: { padding: '18px 20px 16px' } },
    React.createElement('svg', {
      viewBox: `0 0 ${largura} ${altura}`,
      role: 'img',
      'aria-label': `Evolução dos atendimentos. Maior volume: ${maximo}.`,
      style: { width: '100%', height: 180, display: 'block', overflow: 'visible' },
    },
      React.createElement('defs', null,
        React.createElement('linearGradient', { id: 'dashboard-area', x1: '0', y1: '0', x2: '0', y2: '1' },
          React.createElement('stop', { offset: '0%', stopColor: T.primary, stopOpacity: 0.24 }),
          React.createElement('stop', { offset: '100%', stopColor: T.primary, stopOpacity: 0.02 }),
        ),
      ),
      [0.25, 0.5, 0.75].map((fator) => React.createElement('line', {
        key: fator, x1: margem, x2: largura - margem, y1: altura * fator, y2: altura * fator,
        stroke: T.border, strokeDasharray: '4 5',
      })),
      React.createElement('polygon', { points: area, fill: 'url(#dashboard-area)' }),
      React.createElement('polyline', {
        points: linha, fill: 'none', stroke: T.primary, strokeWidth: 3,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
      coords.map((p, index) => React.createElement('circle', {
        key: `${p.dia}-${index}`, cx: p.x, cy: p.y, r: 3.5,
        fill: T.surface, stroke: T.primary, strokeWidth: 2,
      })),
    ),
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: T.textSecondary, fontSize: 10 } },
      indicesRotulo.map((index) => React.createElement('span', { key: index }, formatarDataCurta(pontos[index]?.dia))),
    ),
  );
}

function Barras({ dados, vazio, sufixo = '' }) {
  const lista = (dados || []).slice(0, 6);
  if (!lista.some((item) => Number(item.total ?? item.minutos) > 0)) {
    return React.createElement(EstadoVazioDashboard, {
      mensagem: vazio,
      dica: 'Os dados aparecerão aqui conforme os atendimentos forem registrados.',
    });
  }
  const maximo = Math.max(...lista.map((item) => Number(item.total ?? item.minutos) || 0), 1);
  return React.createElement('div', { style: { padding: '14px 20px 18px', display: 'grid', gap: 12 } },
    lista.map((item) => {
      const valor = Number(item.total ?? item.minutos) || 0;
      return React.createElement('div', { key: item.nome || item.assunto || item.hora, style: { minWidth: 0 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, fontSize: 12 } },
          React.createElement('span', { style: { color: T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.nome || item.assunto || `${item.hora}h`),
          React.createElement('strong', { style: { color: T.text } }, `${valor}${sufixo}`),
        ),
        React.createElement('div', { style: { height: 7, borderRadius: 8, background: T.surfaceMuted, overflow: 'hidden' } },
          React.createElement('div', {
            style: {
              width: `${Math.max(4, (valor / maximo) * 100)}%`, height: '100%',
              borderRadius: 8, background: T.primary,
            },
          }),
        ),
      );
    }),
  );
}

function StatusConversas({ dados }) {
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
      return React.createElement('div', { key: item.status },
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

export function PaginaDashboard({ breakpoint }) {
  const [periodo, setPeriodo] = useState(30);
  const [inicio, setInicio] = useState(() => inicioPeriodo(30));
  const [fim, setFim] = useState(() => dataLocal());
  const [departamentoId, setDepartamentoId] = useState('');
  const [canal, setCanal] = useState('');
  const [metricas, setMetricas] = useState(null);
  const [administrativo, setAdministrativo] = useState(null);
  const [departamentos, setDepartamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const ehMobile = breakpoint === 'mobile';

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const [dadosMetricas, dadosAdmin, listaDepartamentos] = await Promise.all([
        fetchRelatorioMetricas(inicio, fim, { departamentoId, canal, comparar: true }),
        fetchDashboard(),
        fetchDepartamentos(),
      ]);
      setMetricas(dadosMetricas);
      setAdministrativo(dadosAdmin);
      setDepartamentos(listaDepartamentos || []);
      setAtualizadoEm(new Date());
    } catch (error) {
      setErro(error?.message || 'Não foi possível carregar o dashboard.');
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim, departamentoId, canal]);

  useEffect(() => { carregar(); }, [carregar]);

  const selecionarPeriodo = (dias) => {
    setPeriodo(dias);
    setInicio(inicioPeriodo(dias));
    setFim(dataLocal());
  };

  const resumo = metricas?.resumo || {};
  const comparacao = metricas?.comparacao || {};
  const nps = metricas?.nps?.nps;
  const online = useMemo(
    () => (administrativo?.operadores_online || []).filter((item) => item.online).length,
    [administrativo],
  );
  const maxHora = useMemo(
    () => Math.max(...(metricas?.por_hora || []).map((item) => Number(item.total) || 0), 1),
    [metricas],
  );

  const inputStyle = {
    minHeight: 40, border: `1px solid ${T.borderStrong}`, borderRadius: T.radiusSm,
    background: T.surface, color: T.text, padding: '0 11px', fontSize: 12, boxSizing: 'border-box',
  };

  return React.createElement('main', {
    'aria-labelledby': 'dashboard-titulo',
    style: { flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', background: T.bg },
  },
    React.createElement('header', {
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
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          atualizadoEm && React.createElement('span', { style: { color: T.textSecondary, fontSize: 11 } },
            `Atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`),
          React.createElement('button', {
            type: 'button', onClick: carregar, disabled: carregando,
            'aria-label': 'Atualizar dados do dashboard',
            style: {
              minHeight: 40, padding: '0 13px', border: `1px solid ${T.borderStrong}`,
              borderRadius: T.radiusSm, background: T.surface, color: T.textSecondary,
              display: 'inline-flex', alignItems: 'center', gap: 7, cursor: carregando ? 'wait' : 'pointer', fontWeight: 700,
            },
          }, React.createElement(RefreshCw, { size: 16, className: carregando ? 'spin' : undefined }), 'Atualizar'),
        ),
      ),
      React.createElement('div', {
        'aria-label': 'Filtros do dashboard',
        style: { marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      },
        React.createElement('div', { style: { display: 'flex', gap: 3, padding: 3, background: T.surfaceMuted, borderRadius: 10 } },
          [[1, 'Hoje'], [7, '7 dias'], [30, '30 dias']].map(([dias, label]) => React.createElement('button', {
            key: dias, type: 'button', onClick: () => selecionarPeriodo(dias),
            'aria-pressed': periodo === dias,
            style: {
              minHeight: 34, padding: '0 12px', border: 'none', borderRadius: 8,
              background: periodo === dias ? T.surface : 'transparent',
              color: periodo === dias ? (T.primaryHover || T.primary) : T.textSecondary,
              boxShadow: periodo === dias ? T.shadow : 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            },
          }, label)),
        ),
        React.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textSecondary, fontSize: 11 } },
          'De',
          React.createElement('input', {
            type: 'date', value: inicio, max: fim,
            onChange: (e) => { setPeriodo(0); setInicio(e.target.value); },
            'aria-label': 'Data inicial', style: inputStyle,
          }),
        ),
        React.createElement('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textSecondary, fontSize: 11 } },
          'Até',
          React.createElement('input', {
            type: 'date', value: fim, min: inicio, max: dataLocal(),
            onChange: (e) => { setPeriodo(0); setFim(e.target.value); },
            'aria-label': 'Data final', style: inputStyle,
          }),
        ),
        React.createElement('select', {
          value: departamentoId, onChange: (e) => setDepartamentoId(e.target.value),
          'aria-label': 'Filtrar por departamento', style: { ...inputStyle, maxWidth: ehMobile ? '100%' : 210 },
        },
          React.createElement('option', { value: '' }, 'Todos os departamentos'),
          departamentos.map((item) => React.createElement('option', { key: item.id, value: item.id }, item.nome)),
        ),
        React.createElement('select', {
          value: canal, onChange: (e) => setCanal(e.target.value),
          'aria-label': 'Filtrar por canal', style: inputStyle,
        },
          React.createElement('option', { value: '' }, 'Todos os canais'),
          React.createElement('option', { value: 'chatbot' }, 'Chatbot'),
        ),
      ),
    ),

    React.createElement('div', { style: { padding: ehMobile ? 16 : 32, maxWidth: 1680, margin: '0 auto', boxSizing: 'border-box' } },
      erro && React.createElement('div', {
        role: 'alert',
        style: { marginBottom: 16, padding: 14, borderRadius: T.radius, background: T.dangerSoft, color: T.dangerDark, fontSize: 13 },
      }, erro),
      carregando && !metricas
        ? React.createElement('div', { role: 'status', style: { padding: 40, textAlign: 'center', color: T.textMuted } }, 'Carregando indicadores…')
        : React.createElement(React.Fragment, null,
          React.createElement('section', {
            'aria-label': 'Indicadores principais',
            style: {
              display: 'grid', gridTemplateColumns: ehMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 14, marginBottom: 18,
            },
          },
            React.createElement(CartaoKpi, { titulo: 'Conversas criadas', valor: resumo.criadas || 0, detalhe: 'vs. período anterior', icon: MessageCircle, delta: comparacao.delta_criadas }),
            React.createElement(CartaoKpi, { titulo: 'Aguardando atendimento', valor: resumo.na_fila || 0, detalhe: 'na fila agora', icon: Inbox, cor: T.warning }),
            React.createElement(CartaoKpi, { titulo: 'Em atendimento', valor: resumo.em_aberto || 0, detalhe: 'conversas ativas', icon: Headphones, cor: '#7C3AED' }),
            React.createElement(CartaoKpi, { titulo: 'Taxa de resolução', valor: `${resumo.taxa_resolucao || 0}%`, detalhe: 'vs. período anterior', icon: CheckCircle2, cor: T.success, delta: comparacao.delta_taxa_resolucao }),
            React.createElement(CartaoKpi, { titulo: 'Primeira resposta', valor: formatarTempo(resumo.tempo_primeira_resposta_seg), detalhe: 'média do período', icon: Clock3, cor: '#0891B2', delta: comparacao.delta_tempo_resposta, deltaInvertido: true }),
            React.createElement(CartaoKpi, { titulo: 'NPS', valor: Number.isFinite(Number(nps)) ? Math.round(nps) : '—', detalhe: 'satisfação do cidadão', icon: Star, cor: T.warning }),
          ),

          React.createElement('div', {
            style: { display: 'grid', gridTemplateColumns: ehMobile ? '1fr' : 'minmax(0, 1.65fr) minmax(300px, 1fr)', gap: 18, marginBottom: 18 },
          },
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Volume de atendimentos', subtitulo: 'Conversas iniciadas no período selecionado' }),
              React.createElement(GraficoLinha, { dados: metricas?.por_dia }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Conversas por status', subtitulo: 'Distribuição atual da operação' }),
              React.createElement(StatusConversas, { dados: metricas?.por_status }),
            ),
          ),

          React.createElement('div', {
            style: { display: 'grid', gridTemplateColumns: ehMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 18, marginBottom: 18 },
          },
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Demanda por departamento', subtitulo: 'Áreas com maior volume de conversas' }),
              React.createElement(Barras, { dados: metricas?.por_setor, vazio: 'Sem dados por departamento' }),
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
              React.createElement(CabecalhoPainel, { titulo: 'Assuntos mais frequentes', subtitulo: 'Top 5 protocolos do mês' }),
              React.createElement(Barras, { dados: administrativo?.top_assuntos, vazio: 'Ainda não há assuntos suficientes' }),
            ),
            React.createElement(Painel, null,
              React.createElement(CabecalhoPainel, { titulo: 'Horários de maior demanda', subtitulo: 'Mensagens recebidas por hora' }),
              (metricas?.por_hora || []).some((item) => Number(item.total) > 0)
                ? React.createElement('div', { style: { height: 172, padding: '20px 20px 16px', display: 'flex', alignItems: 'flex-end', gap: 5 } },
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
          }, React.createElement(Activity, { size: 14 }), 'Indicadores calculados a partir dos atendimentos registrados no período selecionado.'),
        ),
    ),
  );
}
