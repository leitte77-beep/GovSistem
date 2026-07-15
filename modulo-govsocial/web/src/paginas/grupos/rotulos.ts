/** Rótulos pt-BR (vocabulário SUAS) para grupos/SCFV — sem depender de cor. */

const PERIODICIDADE: Record<string, string> = {
  SEMANAL: "Semanal",
  QUINZENAL: "Quinzenal",
  MENSAL: "Mensal",
  DIARIA: "Diária",
};

const STATUS_ACAO: Record<string, string> = {
  ATIVA: "Ativo",
  ENCERRADA: "Encerrado",
  SUSPENSA: "Suspenso",
  PLANEJADA: "Planejado",
};

const STATUS_INSCRICAO: Record<string, string> = {
  ATIVA: "Ativa",
  LISTA_ESPERA: "Lista de espera",
  DESLIGADA: "Desligada",
  CONCLUIDA: "Concluída",
};

const DIA_SEMANA: Record<string, string> = {
  SEGUNDA: "Segunda-feira",
  TERCA: "Terça-feira",
  QUARTA: "Quarta-feira",
  QUINTA: "Quinta-feira",
  SEXTA: "Sexta-feira",
  SABADO: "Sábado",
  DOMINGO: "Domingo",
};

export function rotuloPeriodicidade(v: string | null | undefined): string {
  if (!v) return "—";
  return PERIODICIDADE[v] ?? v;
}

export function rotuloStatusAcao(v: string): string {
  return STATUS_ACAO[v] ?? v;
}

export function rotuloStatusInscricao(v: string): string {
  return STATUS_INSCRICAO[v] ?? v;
}

export function rotuloDiaSemana(v: string | null | undefined): string {
  if (!v) return "—";
  return DIA_SEMANA[v] ?? v;
}
