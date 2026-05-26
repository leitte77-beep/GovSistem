import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) { return clsx(inputs); }

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(date));
}

export function formatDateOnly(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(date));
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    review: "bg-yellow-100 text-yellow-700",
    approved: "bg-blue-100 text-blue-700",
    published: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    archived: "bg-purple-100 text-purple-700",
    closed: "bg-orange-100 text-orange-700",
    signed: "bg-indigo-100 text-indigo-700",
    cancelled: "bg-red-100 text-red-700",
    pdf_generated: "bg-teal-100 text-teal-700",
  };
  return colors[status] || "bg-gray-100 text-gray-700";
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    review: "Em Revisão",
    approved: "Aprovado",
    published: "Publicado",
    rejected: "Rejeitado",
    archived: "Arquivado",
    closed: "Fechado",
    signed: "Assinado",
    cancelled: "Cancelado",
    pdf_generated: "PDF Gerado",
  };
  return labels[status] || status;
}
