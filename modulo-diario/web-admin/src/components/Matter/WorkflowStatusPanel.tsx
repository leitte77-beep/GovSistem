"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { useAuth } from "@/lib/auth-context";
import {
  WORKFLOW_STATUS_LABEL,
  WORKFLOW_STATUS_STYLE,
  nextWorkflowStatuses,
} from "@/lib/workflowStatus";
import type {
  MatterWorkflowHistoryEntry,
  MatterWorkflowStatus,
} from "@/types/matter";

interface Props {
  matterId: string;
  workflowStatus?: MatterWorkflowStatus | null;
}

export default function WorkflowStatusPanel({ matterId, workflowStatus }: Props) {
  const { user } = useAuth();
  const canEdit = Boolean(
    user?.roles?.some((r) => ["AUTOR", "REVISOR", "ADMIN", "SUPER_ADMIN"].includes(r.name))
  );
  const [current, setCurrent] = useState<MatterWorkflowStatus>(workflowStatus ?? "rascunho");
  const [history, setHistory] = useState<MatterWorkflowHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await api.getMatterWorkflowHistory(matterId));
    } catch (err) {
      notifyError("matter.workflow.history", err);
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  useEffect(() => {
    setCurrent(workflowStatus ?? "rascunho");
  }, [workflowStatus]);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  const advance = async (target: MatterWorkflowStatus) => {
    setBusy(true);
    try {
      const updated = await api.updateMatterWorkflow(matterId, target);
      setCurrent((updated.workflow_status as MatterWorkflowStatus) ?? target);
      toast.success(`Fluxo atualizado para "${WORKFLOW_STATUS_LABEL[target]}".`);
      if (open) await loadHistory();
    } catch (err) {
      notifyError("matter.workflow.update", err);
    } finally {
      setBusy(false);
    }
  };

  const next = nextWorkflowStatuses(current);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant bg-surface p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Fluxo do documento
          </span>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${WORKFLOW_STATUS_STYLE[current]}`}
          >
            {WORKFLOW_STATUS_LABEL[current]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2" aria-label="Ações do fluxo">
          {canEdit &&
            next.map((target) => (
              <button
                key={target}
                type="button"
                disabled={busy}
                onClick={() => advance(target)}
                className={`rounded-lg border px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${
                  target === "cancelado"
                    ? "border-red-300 text-red-700 hover:bg-red-50"
                    : "border-blue-300 text-blue-700 hover:bg-blue-50"
                }`}
              >
                {WORKFLOW_STATUS_LABEL[target]}
              </button>
            ))}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto inline-flex items-center gap-1 rounded text-xs font-medium text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[16px]">history</span>
          {open ? "Ocultar histórico" : "Histórico"}
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-outline-variant bg-surface p-4">
          {loading ? (
            <p className="text-sm text-on-surface-variant">Carregando histórico…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Sem eventos registrados.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((e) => (
                <li key={e.id} className="border-l-2 border-outline-variant pl-3">
                  <p className="text-sm text-on-surface">
                    {e.description ?? e.action}
                    {e.from_status && e.to_status && (
                      <span className="ml-1 text-on-surface-variant">
                        (
                        {WORKFLOW_STATUS_LABEL[e.from_status as MatterWorkflowStatus] ??
                          e.from_status}{" "}
                        →{" "}
                        {WORKFLOW_STATUS_LABEL[e.to_status as MatterWorkflowStatus] ?? e.to_status})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {new Date(e.created_at).toLocaleString("pt-BR")}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
