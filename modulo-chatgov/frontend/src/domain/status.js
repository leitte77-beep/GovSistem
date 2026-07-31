export const CONVERSA_STATUS_UI = Object.freeze({
  NOVA: { label: 'Nova', color: '#7C3AED', background: '#F3E8FF' },
  NA_FILA: { label: 'Na fila', color: '#B45309', background: '#FEF3C7' },
  EM_ATENDIMENTO: { label: 'Em atendimento', color: '#1D4ED8', background: '#DBEAFE' },
  AGUARDANDO_CIDADAO: { label: 'Aguardando cidadão', color: '#0369A1', background: '#E0F2FE' },
  AGUARDANDO_SETOR: { label: 'Aguardando setor', color: '#9A3412', background: '#FFEDD5' },
  RESOLVIDA: { label: 'Resolvida', color: '#047857', background: '#D1FAE5' },
  ARQUIVADA: { label: 'Arquivada', color: '#4B5563', background: '#E5E7EB' },
});

const LEGACY = {
  fila: 'NA_FILA',
  aberta: 'EM_ATENDIMENTO',
  resolvida: 'RESOLVIDA',
  arquivada: 'ARQUIVADA',
};

export function conversationStatus(conversa) {
  return conversa?.status_operacional || LEGACY[conversa?.status] || 'NOVA';
}
