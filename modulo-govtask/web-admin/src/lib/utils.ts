export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00")).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr + (dateStr.includes("T") ? "" : "T23:59:59"));
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

export function relativeTime(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `há ${diffD} dia${diffD > 1 ? "s" : ""}`;
  return formatDate(dateStr);
}

export function prazoColor(days: number): string {
  if (days < 0) return "text-[#B42318]";
  if (days <= 3) return "text-[#B54708]";
  return "text-[#475467]";
}

export function prazoBgColor(days: number): string {
  if (days < 0) return "bg-[#FEE4E2] text-[#B42318]";
  if (days <= 3) return "bg-[#FEF0C7] text-[#B54708]";
  return "bg-[#F6F7F9] text-[#475467]";
}

export const STATUS_COLORS: Record<string, string> = {
  RASCUNHO: "bg-[#667085]/10 text-[#667085]",
  EM_ANDAMENTO: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  SUSPENSO: "bg-[#475467]/10 text-[#475467]",
  CONCLUIDO: "bg-[#067647]/10 text-[#067647]",
  CONCLUIDA: "bg-[#067647]/10 text-[#067647]",
  CANCELADO: "bg-[#475467]/10 text-[#475467]",
  CANCELADA: "bg-[#475467]/10 text-[#475467]",
  AGUARDANDO_ACEITE: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  ENTREGUE: "bg-[#067647]/10 text-[#067647]",
  DEVOLVIDA: "bg-[#B54708]/10 text-[#B54708]",
  CONTESTADA: "bg-[#B54708]/10 text-[#B54708]",
  PENDENTE: "bg-[#667085]/10 text-[#667085]",
  BLOQUEADA: "bg-[#B42318]/10 text-[#B42318]",
  AGUARDANDO_GOVERNO: "bg-[#B54708]/10 text-[#B54708]",
  APROVADA: "bg-[#067647]/10 text-[#067647]",
  REJEITADA: "bg-[#B42318]/10 text-[#B42318]",
};

export const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_ANDAMENTO: "Em Andamento",
  SUSPENSO: "Suspenso",
  CONCLUIDO: "Concluído",
  CONCLUIDA: "Concluída",
  CANCELADO: "Cancelado",
  CANCELADA: "Cancelada",
  AGUARDANDO_ACEITE: "Aguardando Aceite",
  ENTREGUE: "Entregue",
  DEVOLVIDA: "Devolvida",
  CONTESTADA: "Contestada",
  PENDENTE: "Pendente",
  BLOQUEADA: "Bloqueada",
  AGUARDANDO_GOVERNO: "Aguardando Governo",
  APROVADA: "Aprovada",
  REJEITADA: "Rejeitada",
};

export const PRIORITY_COLORS: Record<string, string> = {
  BAIXA: "bg-[#F6F7F9] text-[#667085]",
  NORMAL: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  ALTA: "bg-[#FEF0C7] text-[#B54708]",
  URGENTE: "bg-[#FEE4E2] text-[#B42318]",
};

export const PRIORITY_LABELS: Record<string, string> = {
  BAIXA: "Baixa",
  NORMAL: "Média",
  ALTA: "Alta",
  URGENTE: "Crítica",
};

export const TIPO_CONVENIO_LABELS: Record<string, string> = {
  OBRA: "Obra",
  AQUISICAO: "Aquisição",
  SERVICO: "Serviço",
  OUTRO: "Outro",
};

export const CATEGORIA_RECURSO_LABELS: Record<string, string> = {
  EMENDA_PARLAMENTAR: "Emenda Parlamentar",
  CONVENIO: "Convênio",
  CONTRATO_REPASSE: "Contrato de Repasse",
  TRANSFERENCIA_ESPECIAL: "Transferência Especial",
  TRANSFERENCIA_VOLUNTARIA: "Transferência Voluntária",
  FUNDO_A_FUNDO: "Fundo a Fundo",
  PROGRAMA_ESTADUAL: "Programa Estadual",
  PROGRAMA_FEDERAL: "Programa Federal",
  CUSTEIO: "Custeio",
  INVESTIMENTO: "Investimento",
  AQUISICAO: "Aquisição",
  OBRA: "Obra",
  OUTRO: "Outro",
};

export const ESFERA_LABELS: Record<string, string> = {
  FEDERAL: "Federal",
  ESTADUAL: "Estadual",
  MUNICIPAL: "Municipal",
  OUTRA: "Outra",
};

export const PRIORIDADE_PROCESSO_LABELS: Record<string, string> = {
  BAIXA: "Baixa",
  NORMAL: "Média",
  ALTA: "Alta",
  URGENTE: "Crítica",
};

export const SITUACAO_PROCESSO_LABELS: Record<string, string> = {
  OPORTUNIDADE: "Oportunidade",
  EM_ARTICULACAO: "Em Articulação",
  PREPARANDO_PROPOSTA: "Preparando Proposta",
  PROPOSTA_CADASTRADA: "Proposta Cadastrada",
  EM_ANALISE_GOVERNO: "Em Análise pelo Governo",
  EM_DILIGENCIA: "Em Diligência",
  AGUARDANDO_DOCUMENTACAO: "Aguardando Documentação",
  DOCUMENTACAO_INTERNA: "Documentação Interna em Elaboração",
  AGUARDANDO_APROVACAO: "Aguardando Aprovação",
  APROVADO: "Aprovado",
  FORMALIZACAO: "Em Formalização",
  INSTRUMENTO_CELEBRADO: "Instrumento Celebrado",
  AGUARDANDO_REPASSE: "Aguardando Repasse",
  RECURSO_RECEBIDO: "Recurso Recebido",
  PREPARANDO_CONTRATACAO: "Preparando Contratação",
  EM_LICITACAO: "Em Licitação",
  LICITACAO_CONCLUIDA: "Licitação Concluída",
  CONTRATO_CELEBRADO: "Contrato Celebrado",
  AGUARDANDO_INICIO: "Aguardando Início",
  EM_EXECUCAO: "Em Execução",
  OBRA_ANDAMENTO: "Obra em Andamento",
  AQUISICAO_ANDAMENTO: "Aquisição em Andamento",
  EM_MEDICAO: "Em Medição",
  SUSPENSO: "Suspenso",
  PARALISADO: "Paralisado",
  EM_PRESTACAO: "Em Prestação de Contas",
  PRESTACAO_ENVIADA: "Prestação Enviada",
  PRESTACAO_EM_ANALISE: "Prestação em Análise",
  PRESTACAO_EM_DILIGENCIA: "Prestação em Diligência",
  PRESTACAO_APROVADA: "Prestação Aprovada",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const SITUACAO_PROCESSO_FLOW: string[] = [
  "OPORTUNIDADE", "EM_ARTICULACAO", "PREPARANDO_PROPOSTA", "PROPOSTA_CADASTRADA",
  "EM_ANALISE_GOVERNO", "APROVADO", "FORMALIZACAO", "INSTRUMENTO_CELEBRADO",
  "AGUARDANDO_REPASSE", "RECURSO_RECEBIDO", "EM_LICITACAO", "CONTRATO_CELEBRADO",
  "EM_EXECUCAO", "EM_PRESTACAO", "PRESTACAO_ENVIADA", "PRESTACAO_APROVADA", "CONCLUIDO",
];

export const NATUREZA_ETAPA_LABELS: Record<string, string> = {
  INTERNA: "Interna",
  GOVERNO: "Governo",
};

export const TIPO_DOCUMENTO_LABELS: Record<string, string> = {
  OFICIO: "Ofício",
  PROJETO: "Projeto",
  EDITAL: "Edital",
  CONTRATO: "Contrato",
  FOTO: "Foto",
  MEDICAO: "Medição",
  OUTRO: "Outro",
};

export const CATEGORIA_DOCUMENTO_LABELS: Record<string, string> = {
  PROPOSTA: "Proposta",
  JURIDICO: "Jurídico",
  ENGENHARIA: "Engenharia",
  LICITACAO: "Licitação",
  CONTRATO: "Contrato",
  EXECUCAO: "Execução",
  MEDICOES: "Medições",
  FINANCEIRO: "Financeiro",
  PRESTACAO_CONTAS: "Prestação de Contas",
  FOTOS: "Fotos",
  DOCUMENTOS_EXTERNOS: "Documentos Externos",
  OUTROS: "Outros",
};

export const CLASSIFICACAO_LABELS: Record<string, string> = {
  PUBLICO: "Público",
  INTERNO: "Interno",
  RESTRITO: "Restrito",
  SIGILOSO: "Sigiloso",
};

export const ORIGEM_DILIGENCIA_LABELS: Record<string, string> = {
  GOVERNO_FEDERAL: "Governo Federal",
  GOVERNO_ESTADUAL: "Governo Estadual",
  CONCEDENTE: "Órgão Concedente",
  MANDATARIA: "Entidade Mandatária",
  CONTROLE_INTERNO: "Controle Interno",
  OUTRO: "Outro",
};

export const STATUS_DILIGENCIA_LABELS: Record<string, string> = {
  RECEBIDA: "Recebida",
  DISTRIBUIDA: "Distribuída",
  EM_ATENDIMENTO: "Em Atendimento",
  RESPONDIDA_INTERNAMENTE: "Respondida",
  PROTOCOLADA: "Protocolada",
  ACEITA: "Aceita",
  NOVA_CORRECAO_SOLICITADA: "Nova Correção",
  ENCERRADA: "Encerrada",
};

export const STATUS_REPASSE_LABELS: Record<string, string> = {
  PREVISTO: "Previsto",
  RECEBIDO: "Recebido",
  ATRASADO: "Atrasado",
  CANCELADO: "Cancelado",
};

export const STATUS_MEDICAO_LABELS: Record<string, string> = {
  REGISTRADA: "Registrada",
  EM_ANALISE: "Em Análise",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  PAGA: "Paga",
};

export const TIPO_MOVIMENTO_LABELS: Record<string, string> = {
  EMPENHO: "Empenho",
  LIQUIDACAO: "Liquidação",
  PAGAMENTO: "Pagamento",
  REPASSE_RECEBIDO: "Repasse Recebido",
  RENDIMENTO: "Rendimento",
  DEVOLUCAO: "Devolução",
  OUTRO: "Outro",
};

export const STATUS_CONTRATO_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ASSINADO: "Assinado",
  EM_VIGENCIA: "Em Vigência",
  CONCLUIDO: "Concluído",
  ENCERRADO: "Encerrado",
  RESCINDIDO: "Rescindido",
};

export const TIPO_ADITIVO_LABELS: Record<string, string> = {
  PRAZO: "Prazo",
  VALOR: "Valor",
  OBJETO: "Objeto",
  OUTRO: "Outro",
};

export const STATUS_LICITACAO_LABELS: Record<string, string> = {
  PREPARATORIA: "Fase Preparatória",
  EDITAL_PUBLICADO: "Edital Publicado",
  EM_DISPUTA: "Em Disputa",
  JULGAMENTO: "Julgamento",
  HOMOLOGADA: "Homologada",
  ADJUDICADA: "Adjudicada",
  ANULADA: "Anulada",
  DESERTA: "Deserta",
};

export const STATUS_PRESTACAO_LABELS: Record<string, string> = {
  EM_PREPARACAO: "Em Preparação",
  PRONTA: "Pronta",
  ENVIADA: "Enviada",
  EM_ANALISE: "Em Análise",
  EM_DILIGENCIA: "Em Diligência",
  APROVADA: "Aprovada",
  APROVADA_COM_OBSERVACAO: "Aprovada c/ Observação",
  REJEITADA: "Rejeitada",
  ENCERRADA: "Encerrada",
};

export const STATUS_ENTREGA_LABELS: Record<string, string> = {
  REGISTRADA: "Registrada",
  RECEBIMENTO_PROVISORIO: "Recebimento Provisório",
  RECEBIMENTO_DEFINITIVO: "Recebimento Definitivo",
  INAUGURADA: "Inaugurada",
  ENCERRADA: "Encerrada",
};

// Cores por estado dos novos módulos (herda o padrão semântico existente)
export const RECURSOS_STATUS_COLORS: Record<string, string> = {
  // Diligências
  RECEBIDA: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  DISTRIBUIDA: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  EM_ATENDIMENTO: "bg-[#B54708]/10 text-[#B54708]",
  RESPONDIDA_INTERNAMENTE: "bg-[#B54708]/10 text-[#B54708]",
  PROTOCOLADA: "bg-[#067647]/10 text-[#067647]",
  ACEITA: "bg-[#067647]/10 text-[#067647]",
  NOVA_CORRECAO_SOLICITADA: "bg-[#B42318]/10 text-[#B42318]",
  // Repasses
  PREVISTO: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  ATRASADO: "bg-[#B42318]/10 text-[#B42318]",
  // Medições
  EM_ANALISE: "bg-[#B54708]/10 text-[#B54708]",
  REPROVADA: "bg-[#B42318]/10 text-[#B42318]",
  PAGA: "bg-[#067647]/10 text-[#067647]",
  // Contratos
  ASSINADO: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  EM_VIGENCIA: "bg-[#067647]/10 text-[#067647]",
  RESCINDIDO: "bg-[#B42318]/10 text-[#B42318]",
  // Licitação
  PREPARATORIA: "bg-[#475467]/10 text-[#475467]",
  EDITAL_PUBLICADO: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  EM_DISPUTA: "bg-[#B54708]/10 text-[#B54708]",
  JULGAMENTO: "bg-[#B54708]/10 text-[#B54708]",
  HOMOLOGADA: "bg-[#067647]/10 text-[#067647]",
  ADJUDICADA: "bg-[#067647]/10 text-[#067647]",
  ANULADA: "bg-[#B42318]/10 text-[#B42318]",
  DESERTA: "bg-[#B42318]/10 text-[#B42318]",
  // Prestação
  EM_PREPARACAO: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  PRONTA: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  ENVIADA: "bg-[#B54708]/10 text-[#B54708]",
  EM_DILIGENCIA: "bg-[#B42318]/10 text-[#B42318]",
  APROVADA: "bg-[#067647]/10 text-[#067647]",
  APROVADA_COM_OBSERVACAO: "bg-[#067647]/10 text-[#067647]",
  REJEITADA: "bg-[#B42318]/10 text-[#B42318]",
  // Entregas
  RECEBIMENTO_PROVISORIO: "bg-[#B54708]/10 text-[#B54708]",
  RECEBIMENTO_DEFINITIVO: "bg-[#067647]/10 text-[#067647]",
  INAUGURADA: "bg-[#067647]/10 text-[#067647]",
  // Vistorias de obra
  AGENDADA: "bg-[#F2F4F7] text-[#475467]",
  REALIZADA: "bg-[#EFF8FF] text-[#175CD3]",
  COM_RESSALVA: "bg-[#FEF0C7] text-[#B54708]",
  // Classificação documental
  PUBLICO: "bg-[#067647]/10 text-[#067647]",
  INTERNO: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  RESTRITO: "bg-[#B54708]/10 text-[#B54708]",
  SIGILOSO: "bg-[#B42318]/10 text-[#B42318]",
};

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ── Situação do processo: pill colorida (padrão das telas de recursos) ──
export const SITUACAO_PROCESSO_COLORS: Record<string, string> = {
  OPORTUNIDADE: "bg-[#F2F4F7] text-[#475467]",
  EM_ARTICULACAO: "bg-[#F2F4F7] text-[#475467]",
  PREPARANDO_PROPOSTA: "bg-[#EFF8FF] text-[#175CD3]",
  PROPOSTA_CADASTRADA: "bg-[#EFF8FF] text-[#175CD3]",
  EM_ANALISE_GOVERNO: "bg-[#EFF8FF] text-[#175CD3]",
  EM_DILIGENCIA: "bg-[#FEF0C7] text-[#B54708]",
  AGUARDANDO_DOCUMENTACAO: "bg-[#FEF0C7] text-[#B54708]",
  DOCUMENTACAO_INTERNA: "bg-[#EFF8FF] text-[#175CD3]",
  AGUARDANDO_APROVACAO: "bg-[#FEF0C7] text-[#B54708]",
  APROVADO: "bg-[#ECFDF3] text-[#067647]",
  FORMALIZACAO: "bg-[#EFF8FF] text-[#175CD3]",
  INSTRUMENTO_CELEBRADO: "bg-[#ECFDF3] text-[#067647]",
  AGUARDANDO_REPASSE: "bg-[#FEF0C7] text-[#B54708]",
  RECURSO_RECEBIDO: "bg-[#ECFDF3] text-[#067647]",
  PREPARANDO_CONTRATACAO: "bg-[#EFF8FF] text-[#175CD3]",
  EM_LICITACAO: "bg-[#EFF8FF] text-[#175CD3]",
  LICITACAO_CONCLUIDA: "bg-[#ECFDF3] text-[#067647]",
  CONTRATO_CELEBRADO: "bg-[#ECFDF3] text-[#067647]",
  AGUARDANDO_INICIO: "bg-[#FEF0C7] text-[#B54708]",
  EM_EXECUCAO: "bg-[#EFF8FF] text-[#175CD3]",
  OBRA_ANDAMENTO: "bg-[#EFF8FF] text-[#175CD3]",
  AQUISICAO_ANDAMENTO: "bg-[#EFF8FF] text-[#175CD3]",
  EM_MEDICAO: "bg-[#EFF8FF] text-[#175CD3]",
  SUSPENSO: "bg-[#F2F4F7] text-[#475467]",
  PARALISADO: "bg-[#FEE4E2] text-[#B42318]",
  EM_PRESTACAO: "bg-[#F4F3FF] text-[#5925DC]",
  PRESTACAO_ENVIADA: "bg-[#F4F3FF] text-[#5925DC]",
  PRESTACAO_EM_ANALISE: "bg-[#F4F3FF] text-[#5925DC]",
  PRESTACAO_EM_DILIGENCIA: "bg-[#FEF0C7] text-[#B54708]",
  PRESTACAO_APROVADA: "bg-[#ECFDF3] text-[#067647]",
  CONCLUIDO: "bg-[#ECFDF3] text-[#067647]",
  CANCELADO: "bg-[#F2F4F7] text-[#475467]",
};

/** Rótulo da situação do processo, caindo para o status quando não houver situação. */
export function situacaoLabel(situacao?: string | null, status?: string | null): string {
  if (situacao) return SITUACAO_PROCESSO_LABELS[situacao] || situacao;
  if (status) return STATUS_LABELS[status] || status;
  return "—";
}

/** Cor da pill da situação do processo, caindo para a cor do status. */
export function situacaoColor(situacao?: string | null, status?: string | null): string {
  if (situacao && SITUACAO_PROCESSO_COLORS[situacao]) return SITUACAO_PROCESSO_COLORS[situacao];
  if (status && STATUS_COLORS[status]) return STATUS_COLORS[status];
  return "bg-[#F2F4F7] text-[#475467]";
}

/** "18/08 — 05:30" — formato curto usado na timeline e nos resumos. */
export function formatDayTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} — ${hora}`;
}

/** Percentual sem casa decimal supérflua (a API serializa Decimal como string). */
export function pct(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export function pctLabel(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
