import type { MatterStatus } from "@/types/matter";
import type { EditionStatus as ES } from "@/types/edition";
import type { LucideIcon } from "lucide-react";
import {
  Clock, Eye, CheckCircle2, Globe, Archive, XCircle, RotateCcw,
  CalendarClock, Lock, FileText, PenLine, Signature, Send, Sparkles,
  Copy, Download,
} from "lucide-react";

export type StatusColor =
  | "gray" | "amber" | "red" | "green" | "violet" | "slate" | "blue" | "teal";

/** Definição centralizada de um estado editorial (matéria ou edição). */
export interface StatusDefinition {
  code: string;
  label: string;
  description: string;
  /** classes Tailwind completas (não concatenar) para o badge */
  badge: string;
  /** barra/borda e fundo para banners */
  banner: string;
  color: StatusColor;
  icon: LucideIcon;
  editable: boolean;
  /** rótulo da ação principal recomendada */
  primaryAction: string;
}

/** Cores por estado — mesmo texto/ícone em todos os módulos. */
export const MATTER_STATUSES: Record<MatterStatus, StatusDefinition> = {
  draft: {
    code: "draft",
    label: "Rascunho",
    description: "Matéria em elaboração, ainda não enviada para revisão.",
    badge: "bg-gray-100 text-gray-700",
    banner: "border-gray-300 bg-gray-50 text-gray-700",
    color: "gray",
    icon: Clock,
    editable: true,
    primaryAction: "Continuar edição",
  },
  review: {
    code: "review",
    label: "Em revisão",
    description: "Matéria aguardando revisão e aprovação.",
    badge: "bg-amber-100 text-amber-800",
    banner: "border-amber-300 bg-amber-50 text-amber-800",
    color: "amber",
    icon: Eye,
    editable: false,
    primaryAction: "Revisar",
  },
  approved: {
    code: "approved",
    label: "Aprovada",
    description: "Matéria aprovada pelo revisor e pronta para a edição.",
    badge: "bg-green-100 text-green-800",
    banner: "border-green-300 bg-green-50 text-green-800",
    color: "green",
    icon: CheckCircle2,
    editable: false,
    primaryAction: "Adicionar à edição",
  },
  published: {
    code: "published",
    label: "Publicada",
    description: "Matéria publicada no Diário Oficial.",
    badge: "bg-green-600 text-white",
    banner: "border-green-600 bg-green-50 text-green-900",
    color: "green",
    icon: Globe,
    editable: false,
    primaryAction: "Ver publicação",
  },
  archived: {
    code: "archived",
    label: "Arquivada",
    description: "Matéria arquivada e fora do fluxo ativo.",
    badge: "bg-slate-200 text-slate-700",
    banner: "border-slate-300 bg-slate-50 text-slate-700",
    color: "slate",
    icon: Archive,
    editable: false,
    primaryAction: "Visualizar",
  },
  rejected: {
    code: "rejected",
    label: "Rejeitada",
    description: "Matéria devolvida para correção pelo revisor.",
    badge: "bg-red-100 text-red-800",
    banner: "border-red-300 bg-red-50 text-red-800",
    color: "red",
    icon: XCircle,
    editable: true,
    primaryAction: "Corrigir e reenviar",
  },
};

export const EDITION_STATUSES: Record<ES, StatusDefinition> = {
  draft: {
    code: "draft",
    label: "Rascunho",
    description: "Edição em montagem, ainda aberta para edição.",
    badge: "bg-gray-100 text-gray-700",
    banner: "border-gray-300 bg-gray-50 text-gray-700",
    color: "gray",
    icon: Clock,
    editable: true,
    primaryAction: "Continuar edição",
  },
  reviewing: {
    code: "reviewing",
    label: "Em revisão",
    description: "Edição em análise e validação de conteúdo.",
    badge: "bg-amber-100 text-amber-800",
    banner: "border-amber-300 bg-amber-50 text-amber-800",
    color: "amber",
    icon: Eye,
    editable: false,
    primaryAction: "Revisar edição",
  },
  scheduled: {
    code: "scheduled",
    label: "Agendada",
    description: "Edição programada para publicação.",
    badge: "bg-violet-100 text-violet-800",
    banner: "border-violet-300 bg-violet-50 text-violet-800",
    color: "violet",
    icon: CalendarClock,
    editable: false,
    primaryAction: "Ver agendamento",
  },
  closed: {
    code: "closed",
    label: "Fechada",
    description: "Conteúdo fechado; pronto para geração do PDF.",
    badge: "bg-slate-200 text-slate-700",
    banner: "border-slate-300 bg-slate-50 text-slate-700",
    color: "slate",
    icon: Lock,
    editable: false,
    primaryAction: "Gerar PDF",
  },
  pdf_generated: {
    code: "pdf_generated",
    label: "PDF gerado",
    description: "PDF da edição gerado e aguardando assinatura.",
    badge: "bg-blue-100 text-blue-800",
    banner: "border-blue-300 bg-blue-50 text-blue-800",
    color: "blue",
    icon: FileText,
    editable: false,
    primaryAction: "Assinar PDF",
  },
  signed: {
    code: "signed",
    label: "Assinada",
    description: "Edição assinada digitalmente e validada.",
    badge: "bg-teal-100 text-teal-800",
    banner: "border-teal-300 bg-teal-50 text-teal-800",
    color: "teal",
    icon: Signature,
    editable: false,
    primaryAction: "Publicar",
  },
  published: {
    code: "published",
    label: "Publicada",
    description: "Edição publicada no Diário Oficial.",
    badge: "bg-green-600 text-white",
    banner: "border-green-600 bg-green-50 text-green-900",
    color: "green",
    icon: Globe,
    editable: false,
    primaryAction: "Ver publicação",
  },
  cancelled: {
    code: "cancelled",
    label: "Cancelada",
    description: "Edição cancelada e sem efeito.",
    badge: "bg-red-100 text-red-800",
    banner: "border-red-300 bg-red-50 text-red-800",
    color: "red",
    icon: XCircle,
    editable: false,
    primaryAction: "Visualizar",
  },
};

/** Tipos de edição padronizados em português. */
export const EDITION_TYPES: Record<"normal" | "extra" | "suplementar", string> = {
  normal: "Normal",
  extra: "Extraordinária",
  suplementar: "Suplementar",
};

/** Rótulo por estado de matéria. */
export function matterStatusLabel(s: MatterStatus | string): string {
  return MATTER_STATUSES[s as MatterStatus]?.label ?? String(s);
}

/** Rótulo por estado de edição. */
export function editionStatusLabel(s: ES | string): string {
  return EDITION_STATUSES[s as ES]?.label ?? String(s);
}

/** Ações permitidas por estado de matéria (rótulo em português). */
export const MATTER_ACTIONS: Record<MatterStatus, { key: string; label: string }[]> = {
  draft: [
    { key: "edit", label: "Continuar edição" },
    { key: "duplicate", label: "Duplicar" },
    { key: "archive", label: "Arquivar" },
    { key: "delete", label: "Excluir" },
  ],
  review: [
    { key: "review", label: "Revisar" },
    { key: "view", label: "Visualizar" },
  ],
  approved: [
    { key: "view", label: "Visualizar" },
    { key: "add_to_edition", label: "Adicionar a uma edição" },
  ],
  rejected: [
    { key: "fix", label: "Corrigir e reenviar" },
  ],
  archived: [
    { key: "view", label: "Visualizar" },
    { key: "restore", label: "Restaurar" },
  ],
  published: [
    { key: "view", label: "Visualizar publicação" },
    { key: "open_edition", label: "Abrir edição" },
    { key: "download", label: "Baixar PDF" },
    { key: "verify", label: "Verificar autenticidade" },
  ],
};

/** Ações permitidas por estado de edição. */
export const EDITION_ACTIONS: Record<ES, { key: string; label: string }[]> = {
  draft: [{ key: "edit", label: "Editar" }, { key: "add_matters", label: "Adicionar matérias" }],
  reviewing: [{ key: "review", label: "Revisar" }, { key: "view", label: "Visualizar" }],
  scheduled: [{ key: "view", label: "Ver agendamento" }, { key: "reschedule", label: "Reagendar" }, { key: "cancel", label: "Cancelar" }],
  closed: [{ key: "generate_pdf", label: "Gerar PDF" }, { key: "reopen", label: "Reabrir para edição" }, { key: "view", label: "Visualizar" }],
  pdf_generated: [{ key: "sign", label: "Assinar PDF" }, { key: "download", label: "Baixar PDF" }, { key: "regenerate", label: "Regenerar PDF" }],
  signed: [{ key: "publish", label: "Publicar" }, { key: "download", label: "Baixar PDF" }, { key: "validate", label: "Validar assinatura" }],
  published: [{ key: "view", label: "Visualizar" }, { key: "download", label: "Baixar PDF" }, { key: "verify", label: "Verificar autenticidade" }],
  cancelled: [{ key: "view", label: "Visualizar" }],
};

/** Ícones utilitários reutilizados em menus/ações. */
export const ACTION_ICONS = {
  edit: PenLine,
  duplicate: Copy,
  archive: Archive,
  delete: XCircle,
  review: Eye,
  view: Eye,
  add_to_edition: Send,
  fix: RotateCcw,
  restore: RotateCcw,
  open_edition: FileText,
  download: Download,
  verify: Sparkles,
  add_matters: FileText,
  reschedule: CalendarClock,
  cancel: XCircle,
  generate_pdf: FileText,
  reopen: Lock,
  sign: Signature,
  regenerate: RotateCcw,
  publish: Globe,
  validate: CheckCircle2,
} as const;
