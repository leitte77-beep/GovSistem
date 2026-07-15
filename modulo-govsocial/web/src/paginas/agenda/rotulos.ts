/** Rótulos pt-BR (vocabulário SUAS) para agenda, fila e encaminhamentos. */

const STATUS_AGENDAMENTO: Record<string, string> = {
  AGENDADO: "Agendado",
  AGUARDANDO: "Aguardando",
  EM_ATENDIMENTO: "Em atendimento",
  CONCLUIDO: "Concluído",
  FALTOU: "Faltou",
  CANCELADO: "Cancelado",
};

const STATUS_RECEPCAO: Record<string, string> = {
  AGUARDANDO: "Aguardando",
  EM_ATENDIMENTO: "Em atendimento",
  ATENDIDO: "Atendido",
  DESISTIU: "Desistiu",
  ENCAMINHADO: "Encaminhado",
};

const TIPO_AGENDAMENTO: Record<string, string> = {
  ATENDIMENTO: "Atendimento",
  VISITA_DOMICILIAR: "Visita domiciliar",
  GRUPO: "Grupo",
};

const STATUS_ENCAMINHAMENTO: Record<string, string> = {
  PENDENTE: "Aguardando aceite",
  ACEITO: "Em atendimento",
  DEVOLVIDO: "Com devolutiva",
  RECUSADO: "Recusado",
  CANCELADO: "Cancelado",
  OFICIO_GERADO: "Ofício gerado",
  ENVIADO: "Enviado",
};

export function rotuloStatusAgendamento(v: string): string {
  return STATUS_AGENDAMENTO[v] ?? v;
}

export function rotuloStatusRecepcao(v: string): string {
  return STATUS_RECEPCAO[v] ?? v;
}

export function rotuloTipoAgendamento(v: string): string {
  return TIPO_AGENDAMENTO[v] ?? v;
}

export function rotuloStatusEncaminhamento(v: string): string {
  return STATUS_ENCAMINHAMENTO[v] ?? v;
}
