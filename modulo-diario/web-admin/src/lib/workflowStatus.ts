import type { MatterWorkflowStatus } from "@/types/matter";

export const WORKFLOW_STATUS_LABEL: Record<MatterWorkflowStatus, string> = {
  rascunho: "Rascunho",
  gerado_pela_ia: "Gerado pela IA",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
  publicado: "Publicado",
  cancelado: "Cancelado",
};

export const WORKFLOW_STATUS_STYLE: Record<MatterWorkflowStatus, string> = {
  rascunho: "bg-gray-100 text-gray-700",
  gerado_pela_ia: "bg-indigo-100 text-indigo-800",
  em_revisao: "bg-amber-100 text-amber-800",
  aprovado: "bg-blue-100 text-blue-800",
  aguardando_assinatura: "bg-purple-100 text-purple-800",
  assinado: "bg-teal-100 text-teal-800",
  publicado: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-700",
};

/** Transições permitidas, espelhando `MatterWorkflowStatus.valid_transitions`. */
export const WORKFLOW_TRANSITIONS: Record<MatterWorkflowStatus, MatterWorkflowStatus[]> = {
  rascunho: ["gerado_pela_ia", "em_revisao", "cancelado"],
  gerado_pela_ia: ["rascunho", "em_revisao", "cancelado"],
  em_revisao: ["aprovado", "rascunho", "cancelado"],
  aprovado: ["aguardando_assinatura", "em_revisao", "cancelado"],
  aguardando_assinatura: ["assinado", "cancelado"],
  assinado: ["publicado", "cancelado"],
  publicado: [],
  cancelado: [],
};

export function nextWorkflowStatuses(status: string | null | undefined): MatterWorkflowStatus[] {
  const current = (status ?? "rascunho") as MatterWorkflowStatus;
  return WORKFLOW_TRANSITIONS[current] ?? [];
}
