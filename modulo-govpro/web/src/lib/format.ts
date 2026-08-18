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
  EM_TRAMITACAO: "Aberto",
  SOBRESTADO: "Sobrestado",
  ENCERRADO: "Concluído",
  ARQUIVADO: "Arquivado",
};

export const SITUACAO_TONE: Record<string, "primary" | "success" | "warning" | "neutral" | "error"> = {
  EM_TRAMITACAO: "primary",
  SOBRESTADO: "warning",
  ENCERRADO: "neutral",
  ARQUIVADO: "success",
};

export const NIVEL_ACESSO_LABEL: Record<string, string> = {
  PUBLICO: "Público",
  RESTRITO: "Restrito",
  SIGILOSO: "Sigiloso",
};

export const NIVEL_ACESSO_TONE: Record<string, "success" | "warning" | "error" | "neutral"> = {
  PUBLICO: "success",
  RESTRITO: "warning",
  SIGILOSO: "error",
};

export const SITUACAO_DOCUMENTO_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ASSINADO: "Assinado",
  PUBLICADO: "Publicado",
  DESENTRANHADO: "Desentranhado",
};

export const TIPO_EVENTO_LABEL: Record<string, string> = {
  AUTUACAO: "Início do Processo",
  JUNTADA: "Juntada",
  PRODUCAO_DOCUMENTO: "Produção de documento",
  ASSINATURA: "Assinatura",
  TRAMITACAO: "Envio",
  DEVOLUCAO: "Devolução",
  DESENTRANHAMENTO: "Desentranhamento",
  SOBRESTAMENTO: "Sobrestamento",
  REATIVACAO: "Reativação",
  DESPACHO: "Despacho",
  ENCERRAMENTO: "Conclusão na Unidade",
  ARQUIVAMENTO: "Arquivamento",
  REABERTURA: "Reabertura",
  OUTRO: "Outro",
};

export function initials(name: string): string {
  return (name || "?").trim().charAt(0).toUpperCase();
}
