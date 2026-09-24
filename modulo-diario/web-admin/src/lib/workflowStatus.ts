import type { MatterWorkflowStatus } from "@/types/matter";

export const WORKFLOW_STATUS_LABEL: Record<MatterWorkflowStatus, string> = {
  rascunho: "Rascunho",
  em_elaboracao: "Em elaboração",
  gerado_pela_ia: "Gerado pela IA",
  aguardando_revisao: "Aguardando revisão",
  em_revisao: "Em revisão",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  aguardando_publicacao: "Aguardando publicação",
  inserida_em_edicao: "Inserida em edição",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
  publicado: "Publicado",
  devolvida_para_correcao: "Devolvida para correção",
  retificada: "Retificada",
  substituida: "Substituída",
  cancelado: "Cancelado",
};

export const WORKFLOW_STATUS_STYLE: Record<MatterWorkflowStatus, string> = {
  rascunho: "bg-gray-100 text-gray-700",
  em_elaboracao: "bg-gray-100 text-gray-700",
  gerado_pela_ia: "bg-indigo-100 text-indigo-800",
  aguardando_revisao: "bg-amber-100 text-amber-800",
  em_revisao: "bg-amber-100 text-amber-800",
  aguardando_aprovacao: "bg-orange-100 text-orange-800",
  aprovado: "bg-blue-100 text-blue-800",
  aguardando_publicacao: "bg-cyan-100 text-cyan-800",
  inserida_em_edicao: "bg-cyan-100 text-cyan-800",
  aguardando_assinatura: "bg-purple-100 text-purple-800",
  assinado: "bg-teal-100 text-teal-800",
  publicado: "bg-green-100 text-green-800",
  devolvida_para_correcao: "bg-rose-100 text-rose-800",
  retificada: "bg-slate-100 text-slate-700",
  substituida: "bg-slate-100 text-slate-700",
  cancelado: "bg-red-100 text-red-700",
};

/** Transições permitidas, espelhando `MatterWorkflowStatus.valid_transitions`. */
export const WORKFLOW_TRANSITIONS: Record<MatterWorkflowStatus, MatterWorkflowStatus[]> = {
  rascunho: ["em_elaboracao", "gerado_pela_ia", "em_revisao", "cancelado"],
  em_elaboracao: ["rascunho", "em_revisao", "cancelado"],
  gerado_pela_ia: ["rascunho", "em_elaboracao", "em_revisao", "cancelado"],
  aguardando_revisao: ["em_revisao", "devolvida_para_correcao", "cancelado"],
  em_revisao: [
    "aprovado",
    "aguardando_aprovacao",
    "aguardando_revisao",
    "devolvida_para_correcao",
    "rascunho",
    "cancelado",
  ],
  aguardando_aprovacao: ["aprovado", "devolvida_para_correcao", "cancelado"],
  aprovado: [
    "aguardando_publicacao",
    "inserida_em_edicao",
    "aguardando_assinatura",
    "em_revisao",
    "cancelado",
  ],
  aguardando_publicacao: ["inserida_em_edicao", "publicado", "cancelado"],
  inserida_em_edicao: ["publicado", "aguardando_publicacao", "cancelado"],
  aguardando_assinatura: ["assinado", "cancelado"],
  assinado: ["publicado", "cancelado"],
  publicado: ["retificada", "substituida"],
  devolvida_para_correcao: ["rascunho", "em_elaboracao", "em_revisao", "cancelado"],
  retificada: [],
  substituida: [],
  cancelado: [],
};

export function nextWorkflowStatuses(status: string | null | undefined): MatterWorkflowStatus[] {
  const current = (status ?? "rascunho") as MatterWorkflowStatus;
  return WORKFLOW_TRANSITIONS[current] ?? [];
}
