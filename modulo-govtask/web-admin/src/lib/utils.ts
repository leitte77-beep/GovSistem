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
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const TIPO_CONVENIO_LABELS: Record<string, string> = {
  OBRA: "Obra",
  AQUISICAO: "Aquisição",
  SERVICO: "Serviço",
  OUTRO: "Outro",
};

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

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
