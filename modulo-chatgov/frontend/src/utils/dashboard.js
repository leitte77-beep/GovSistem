// Regras de leitura do painel operacional. Ficam fora do componente para
// poderem ser testadas sem montar React.

export function formatarTempo(segundos) {
  const total = Math.max(0, Math.round(Number(segundos) || 0));
  if (total < 60) return `${total}s`;
  const minutos = Math.round(total / 60);
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

export function formatarDataCurta(valor) {
  if (!valor) return '';
  const [, mes, dia] = String(valor).split('-');
  return dia && mes ? `${dia}/${mes}` : String(valor);
}

export function dataLocal(date = new Date()) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function inicioPeriodo(dias, hoje = new Date()) {
  const date = new Date(hoje);
  date.setDate(date.getDate() - Math.max(0, dias - 1));
  return dataLocal(date);
}

// Atalhos que um gestor pede de verdade — "mês passado" é a base da prestação
// de contas e não dava para montar com os três botões antigos.
export function periodosRapidos(hoje = new Date()) {
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const fimMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  return [
    { chave: 'hoje', rotulo: 'Hoje', inicio: dataLocal(hoje), fim: dataLocal(hoje) },
    { chave: 'ontem', rotulo: 'Ontem', inicio: dataLocal(ontem), fim: dataLocal(ontem) },
    { chave: '7d', rotulo: '7 dias', inicio: inicioPeriodo(7, hoje), fim: dataLocal(hoje) },
    { chave: '30d', rotulo: '30 dias', inicio: inicioPeriodo(30, hoje), fim: dataLocal(hoje) },
    { chave: 'mes', rotulo: 'Este mês', inicio: dataLocal(inicioMes), fim: dataLocal(hoje) },
    { chave: 'mes_anterior', rotulo: 'Mês passado', inicio: dataLocal(inicioMesPassado), fim: dataLocal(fimMesPassado) },
  ];
}

// Semáforo do indicador. Sem meta, um número não diz se está bom ou ruim.
export function situacaoMeta(segundos, metaMinutos, alertaPercentual = 80) {
  const minutos = Number(segundos) / 60;
  const meta = Number(metaMinutos);
  if (!Number.isFinite(minutos) || minutos <= 0 || !Number.isFinite(meta) || meta <= 0) return 'NO_PRAZO';
  if (minutos >= meta) return 'VENCIDO';
  if (minutos >= meta * (Number(alertaPercentual) || 80) / 100) return 'PROXIMO';
  return 'NO_PRAZO';
}

export const ROTULO_SITUACAO = Object.freeze({
  NO_PRAZO: 'dentro da meta',
  PROXIMO: 'perto da meta',
  VENCIDO: 'acima da meta',
});

// Texto do recorte, para o cabeçalho impresso e para o CSV: um PDF sem os
// filtros aplicados não é auditável — ninguém sabe depois o que ele mostrava.
export function descreverFiltros({ inicio, fim, departamentoNome, canalRotulo }) {
  const partes = [];
  if (inicio && fim) {
    partes.push(inicio === fim
      ? `Dia ${formatarDataBr(inicio)}`
      : `De ${formatarDataBr(inicio)} a ${formatarDataBr(fim)}`);
  }
  partes.push(departamentoNome ? `Setor: ${departamentoNome}` : 'Todos os setores');
  partes.push(canalRotulo ? `Atendimento: ${canalRotulo}` : 'Todo o atendimento');
  return partes.join(' · ');
}

export function formatarDataBr(valor) {
  if (!valor) return '';
  const [ano, mes, dia] = String(valor).split('-');
  return dia ? `${dia}/${mes}/${ano}` : String(valor);
}

// Matriz do CSV/Excel: cabeçalho com a procedência e um bloco por painel, para
// o arquivo ser lido sozinho, longe da tela que o gerou.
export function matrizesDashboard(dados, contexto = {}) {
  const { metricas, administrativo } = dados || {};
  const resumo = metricas?.resumo || {};
  const fila = administrativo?.fila || {};
  const atendimento = administrativo?.atendimento || {};
  const metas = administrativo?.metas || {};

  const cabecalho = [
    ['Painel operacional — ChatGov'],
    [contexto.orgao || 'Órgão'],
    [descreverFiltros(contexto)],
    [`Emitido em ${contexto.emitidoEm || ''} por ${contexto.emitidoPor || '—'}`],
    [],
  ];

  const indicadores = [
    ['Indicador', 'Valor'],
    ['Conversas criadas no período', resumo.criadas ?? 0],
    ['Mensagens recebidas', resumo.recebidas ?? 0],
    ['Mensagens enviadas', resumo.enviadas ?? 0],
    ['Taxa de resolução (%)', resumo.taxa_resolucao ?? 0],
    ['Tempo médio de 1ª resposta (s)', resumo.tempo_primeira_resposta_seg ?? 0],
    ['Meta de 1ª resposta (min)', metas.primeira_resposta_minutos ?? ''],
    ['NPS', metricas?.nps?.nps ?? ''],
    ['Aguardando agora', fila.total ?? 0],
    ['Maior espera na fila (s)', fila.maior_espera_seg ?? 0],
    ['Aguardando acima da meta', fila.fora_da_meta ?? 0],
    ['Sem nenhuma resposta humana', fila.sem_primeira_resposta ?? 0],
    ['Respostas da Iris', atendimento.respostas_bot ?? 0],
    ['Respostas da equipe', atendimento.respostas_humano ?? 0],
    ['Atendimento resolvido pela Iris (%)', atendimento.percentual_bot ?? 0],
    [],
  ];

  const porDia = [['Dia', 'Conversas']]
    .concat((metricas?.por_dia || []).map((item) => [item.dia, Number(item.total) || 0]))
    .concat([[]]);

  const porSetor = [['Setor', 'Conversas']]
    .concat((metricas?.por_setor || []).map((item) => [item.nome, Number(item.total) || 0]))
    .concat([[]]);

  const porStatus = [['Status', 'Conversas']]
    .concat((metricas?.por_status || []).map((item) => [item.status, Number(item.total ?? item.count) || 0]))
    .concat([[]]);

  const porHora = [['Hora', 'Mensagens recebidas']]
    .concat((metricas?.por_hora || []).map((item) => [`${item.hora}h`, Number(item.total) || 0]))
    .concat([[]]);

  const ranking = [['Atendente', 'Mensagens enviadas', 'Conversas']]
    .concat((metricas?.ranking_atendentes || []).map((item) => [item.nome, Number(item.enviadas) || 0, Number(item.conversas) || 0]))
    .concat([[]]);

  const tma = [['Setor', 'Tempo médio de conclusão (min)']]
    .concat((administrativo?.tma_por_setor || []).map((item) => [item.nome, Number(item.minutos) || 0]));

  return [
    { nome: 'Resumo', linhas: cabecalho.concat(indicadores) },
    { nome: 'Por dia', linhas: porDia },
    { nome: 'Por setor', linhas: porSetor },
    { nome: 'Por status', linhas: porStatus },
    { nome: 'Por hora', linhas: porHora },
    { nome: 'Atendentes', linhas: ranking },
    { nome: 'TMA por setor', linhas: tma },
  ];
}
