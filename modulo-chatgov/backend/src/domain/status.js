export const CONVERSA_STATUS = Object.freeze({
  NOVA: 'NOVA',
  NA_FILA: 'NA_FILA',
  EM_ATENDIMENTO: 'EM_ATENDIMENTO',
  AGUARDANDO_CIDADAO: 'AGUARDANDO_CIDADAO',
  AGUARDANDO_SETOR: 'AGUARDANDO_SETOR',
  RESOLVIDA: 'RESOLVIDA',
  ARQUIVADA: 'ARQUIVADA',
});

export const PROTOCOLO_STATUS = Object.freeze({
  ABERTO: 'ABERTO',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  PENDENTE: 'PENDENTE',
  CONCLUIDO: 'CONCLUIDO',
  CANCELADO: 'CANCELADO',
});

const CONVERSA_TRANSITIONS = Object.freeze({
  NOVA: ['NA_FILA', 'ARQUIVADA'],
  NA_FILA: ['EM_ATENDIMENTO', 'ARQUIVADA'],
  EM_ATENDIMENTO: ['NA_FILA', 'AGUARDANDO_CIDADAO', 'AGUARDANDO_SETOR', 'RESOLVIDA', 'ARQUIVADA'],
  AGUARDANDO_CIDADAO: ['EM_ATENDIMENTO', 'AGUARDANDO_SETOR', 'RESOLVIDA', 'ARQUIVADA'],
  AGUARDANDO_SETOR: ['EM_ATENDIMENTO', 'AGUARDANDO_CIDADAO', 'RESOLVIDA', 'ARQUIVADA'],
  RESOLVIDA: ['EM_ATENDIMENTO', 'ARQUIVADA'],
  ARQUIVADA: ['NA_FILA', 'EM_ATENDIMENTO'],
});

const PROTOCOLO_TRANSITIONS = Object.freeze({
  ABERTO: ['EM_ANDAMENTO', 'PENDENTE', 'CONCLUIDO', 'CANCELADO'],
  EM_ANDAMENTO: ['PENDENTE', 'CONCLUIDO', 'CANCELADO'],
  PENDENTE: ['EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: ['EM_ANDAMENTO'],
  CANCELADO: [],
});

export const LEGACY_CONVERSA_STATUS = Object.freeze({
  fila: 'NA_FILA',
  aberta: 'EM_ATENDIMENTO',
  resolvida: 'RESOLVIDA',
  arquivada: 'ARQUIVADA',
});

export const LEGACY_PROTOCOLO_STATUS = Object.freeze({
  aberto: 'ABERTO',
  em_andamento: 'EM_ANDAMENTO',
  pendente: 'PENDENTE',
  concluido: 'CONCLUIDO',
  encerrado: 'CONCLUIDO',
  cancelado: 'CANCELADO',
});

export function normalizeStatus(entity, value) {
  const normalized = String(value || '').trim();
  if (entity === 'conversa') {
    return LEGACY_CONVERSA_STATUS[normalized.toLowerCase()] || normalized.toUpperCase();
  }
  if (entity === 'protocolo') {
    return LEGACY_PROTOCOLO_STATUS[normalized.toLowerCase()] || normalized.toUpperCase();
  }
  throw new Error(`Entidade de status inválida: ${entity}`);
}

export function assertTransition(entity, from, to, context = {}) {
  const current = normalizeStatus(entity, from);
  const target = normalizeStatus(entity, to);
  const transitions = entity === 'conversa' ? CONVERSA_TRANSITIONS : PROTOCOLO_TRANSITIONS;

  if (!transitions[current]?.includes(target)) {
    throw new Error(`Transição inválida: ${current} → ${target}`);
  }
  if (entity === 'conversa' && target === 'RESOLVIDA' && !context.operadorId && context.origem !== 'automacao') {
    throw new Error('Uma conversa só pode ser resolvida com atendente responsável');
  }
  if (entity === 'protocolo' && current === 'CONCLUIDO' && target === 'EM_ANDAMENTO' && !context.justificativa?.trim()) {
    throw new Error('A reabertura exige justificativa');
  }
  return target;
}

export function allowedTransitions(entity, status) {
  const normalized = normalizeStatus(entity, status);
  const transitions = entity === 'conversa' ? CONVERSA_TRANSITIONS : PROTOCOLO_TRANSITIONS;
  return [...(transitions[normalized] || [])];
}
