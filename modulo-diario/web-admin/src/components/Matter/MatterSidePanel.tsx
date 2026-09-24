"use client";

import type { ActType, MatterStatus, OrgUnit } from "@/types/matter";

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface SemanticStatus {
  analyzed: boolean;
  pendingBlocks: number;
  errors: number;
  warnings: number;
  loading: boolean;
}

interface Props {
  title: string;
  actTypeName: string | null;
  actNumber: string | null;
  actYear: number | null;
  actDate: string | null;
  orgUnit: OrgUnit | null;
  status: MatterStatus;
  documentMode: string;
  semantic: { mode: boolean; hasDoc: boolean; status: SemanticStatus | null };
  saveState: SaveState;
  lastSavedAt: Date | null;
  alertCount: number;
  children?: React.ReactNode;
}

function formatTime(d: Date | null): string {
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

const DOC_MODE_LABEL: Record<string, string> = {
  rich_text: "Editável",
  pdf: "PDF pronto",
  semantic: "Editável (semântico)",
  legacy_html: "Importado",
  original_pdf: "PDF original",
};

function saveLine(saveState: SaveState, lastSavedAt: Date | null): { icon: string; color: string; spin?: boolean; label: string } {
  if (saveState === "saving") return { icon: "progress_activity", color: "text-primary", spin: true, label: "Salvando…" };
  if (saveState === "saved") return { icon: "check_circle", color: "text-secondary", label: `Salvo às ${formatTime(lastSavedAt)}` };
  if (saveState === "error") return { icon: "error", color: "text-error", label: "Não foi possível salvar" };
  return { icon: "schedule", color: "text-on-surface-variant", label: "Aguardando salvamento" };
}

/**
 * Persistent side panel for the DOCUMENTO step: matter summary, semantic
 * engine state, autosave state and alerts — replaces the old permanent
 * "Dica de Edição" box and the detached bottom "RESUMO DA MATÉRIA".
 */
export default function MatterSidePanel(props: Props) {
  const {
    title, actTypeName, actNumber, actYear, actDate, orgUnit, documentMode, semantic, saveState, lastSavedAt, alertCount,
  } = props;
  const save = saveLine(saveState, lastSavedAt);

  const semanticLine: { icon: string; color: string; label: string } = (() => {
    if (!semantic.mode && documentMode !== "semantic") return { icon: "radio_button_unchecked", color: "text-on-surface-variant", label: "Análise pendente" };
    const st = semantic.status;
    if (!st) return { icon: "radio_button_unchecked", color: "text-on-surface-variant", label: "Análise pendente" };
    if (st.errors > 0) return { icon: "cancel", color: "text-error", label: `${st.errors} ponto(s) com erro` };
    if (st.analyzed && st.pendingBlocks > 0) return { icon: "pending", color: "text-amber-600", label: `${st.pendingBlocks} bloco(s) a confirmar` };
    if (st.analyzed) return { icon: "check_circle", color: "text-secondary", label: "Estrutura analisada" };
    return { icon: "radio_button_unchecked", color: "text-on-surface-variant", label: "Análise pendente" };
  })();

  return (
    <aside aria-label="Resumo da matéria" className="space-y-gutter">
      <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
        <h3 className="text-label-md font-label-md text-on-surface-variant mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[18px]" aria-hidden="true">summarize</span>
          RESUMO DA MATÉRIA
        </h3>
        <dl className="space-y-3 text-body-sm">
          <div>
            <dt className="text-[10px] text-on-surface-variant uppercase tracking-wider">Título</dt>
            <dd className="text-body-sm font-semibold text-primary break-words">{title || "Sem título"}</dd>
          </div>
          {(actNumber || actYear) && (
            <div className="flex justify-between gap-2">
              <dt className="text-on-surface-variant shrink-0">Ato</dt>
              <dd className="text-on-surface text-right">
                {actTypeName ?? ""}
                {actNumber ? ` Nº ${actNumber}` : ""}
                {actYear ? `/${actYear}` : ""}
              </dd>
            </div>
          )}
          {actDate && (
            <div className="flex justify-between gap-2">
              <dt className="text-on-surface-variant shrink-0">Data do ato</dt>
              <dd className="text-on-surface">{new Date(`${actDate}T12:00:00`).toLocaleDateString("pt-BR")}</dd>
            </div>
          )}
          {orgUnit && (
            <div className="flex justify-between gap-2">
              <dt className="text-on-surface-variant shrink-0">Unidade</dt>
              <dd className="text-on-surface text-right">{orgUnit.parent_name ? `${orgUnit.parent_name} › ${orgUnit.name}` : orgUnit.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant shrink-0">Status</dt>
            <dd className="text-on-surface">{statusBadgeLabel(props.status)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant shrink-0">Documento</dt>
            <dd className="text-on-surface">{DOC_MODE_LABEL[documentMode] ?? documentMode}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant shrink-0">Motor semântico</dt>
            <dd className={`flex items-center gap-1 ${semanticLine.color}`}>
              <span className={`material-symbols-outlined text-[14px]`} aria-hidden="true">{semanticLine.icon}</span>
              {semanticLine.label}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant shrink-0">Salvamento</dt>
            <dd className={`flex items-center gap-1 ${save.color}`}>
              <span className={`material-symbols-outlined text-[14px] ${save.spin ? "animate-spin" : ""}`} aria-hidden="true">{save.icon}</span>
              {save.label}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-on-surface-variant shrink-0">Alertas</dt>
            <dd className={alertCount > 0 ? "text-amber-600 flex items-center gap-1" : "text-secondary flex items-center gap-1"}>
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{alertCount > 0 ? "warning" : "check_circle"}</span>
              {alertCount > 0 ? `${alertCount} alerta(s)` : "Nenhum"}
            </dd>
          </div>
        </dl>
      </div>
      {props.children}
    </aside>
  );
}

function statusBadgeLabel(status: MatterStatus | string): string {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    review: "Em revisão",
    approved: "Aprovada",
    published: "Publicada",
    archived: "Arquivada",
    rejected: "Rejeitada",
  };
  return labels[status] ?? String(status);
}
