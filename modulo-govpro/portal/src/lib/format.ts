export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const SITUACAO_LABEL: Record<string, string> = {
  EM_TRAMITACAO: "Em tramitação",
  SOBRESTADO: "Sobrestado",
  ENCERRADO: "Encerrado",
  ARQUIVADO: "Arquivado",
};

export const STATUS_PETICIONAMENTO_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  CONCLUIDO: "Concluído",
  REJEITADO: "Rejeitado",
};

export const STATUS_INTIMACAO_LABEL: Record<string, string> = {
  DISPONIBILIZADA: "Disponibilizada",
  CONSULTADA: "Consultada",
  CIENTE: "Ciente",
  DECURSO: "Decurso",
};
