"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";

interface OpenEdition {
  id: string;
  number: number;
  year: number;
  title: string;
  publication_date: string;
  status: string;
  item_count: number;
}

interface Props {
  matterId: string;
  matterTitle: string;
  status: string;
  /** Called after the matter is successfully added to an edition. */
  onPublished?: () => void;
}

const OPEN_STATUS_LABEL: Record<string, string> = {
  draft: "Aberta",
  reviewing: "Em revisão",
  scheduled: "Agendada",
};

function formatDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

/**
 * Publication destination for step 3.
 *
 * The matter wizard never publishes directly: a matter must be APPROVED and
 * then included in an EDITION (by a diagramador/admin), which is then closed,
 * signed and published. This section makes that destination explicit instead
 * of leaving an ambiguous "Publicar" button.
 */
export default function PublishSection({ matterId, matterTitle, status, onPublished }: Props) {
  const { user } = useAuth();
  const roles = new Set((user?.roles ?? []).map((r) => r.name));
  const canCompose = roles.has("DIAGRAMADOR") || roles.has("ADMIN");
  const [editions, setEditions] = useState<OpenEdition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "approved" || !canCompose) return;
    api
      .listOpenEditions()
      .then(setEditions)
      .catch((err) => notifyError("PublishSection.listOpenEditions", err));
  }, [status, canCompose, matterId]);

  const selectedEdition = editions.find((e) => e.id === editionId) ?? null;

  if (status !== "approved" && status !== "published") return null;

  const handleConfirm = async () => {
    if (!selectedEdition) return;
    setBusy(true);
    try {
      await api.addEditionItem(selectedEdition.id, matterId);
      setConfirmOpen(false);
      setEditionId("");
      setEditions((prev) =>
        prev.map((e) => (e.id === selectedEdition.id ? { ...e, item_count: e.item_count + 1 } : e))
      );
      setMessage("Matéria incluída na edição com sucesso.");
      onPublished?.();
    } catch (err) {
      notifyError("PublishSection.addEditionItem", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary">public</span>
        <h3 className="text-headline-sm font-headline-sm text-primary">Publicação</h3>
      </div>

      {status === "approved" && canCompose && (
        <>
          <p className="text-body-sm text-on-surface-variant mb-4">
            A matéria está aprovada. Escolha a edição em que ela será publicada.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {editions.length === 0 && !message && (
              <p className="text-body-sm text-on-surface-variant md:col-span-2">
                Nenhuma edição aberta no momento. Crie uma edição em <strong>Edições</strong> antes de compor o Diário.
              </p>
            )}
            {editions.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={editionId === e.id}
                onClick={() => setEditionId(e.id)}
                className={clsx(
                  "flex flex-col items-start rounded-xl border p-4 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  editionId === e.id
                    ? "border-primary bg-primary-fixed/20 shadow-sm"
                    : "border-outline-variant hover:border-primary"
                )}
              >
                <span className="flex items-center gap-2 text-body-sm font-semibold text-on-surface">
                  {editionId === e.id && (
                    <span className="material-symbols-outlined text-secondary text-[18px]" aria-hidden="true">check_circle</span>
                  )}
                  Edição nº {e.number}/{e.year}
                </span>
                <span className="text-xs text-on-surface-variant mt-0.5">
                  {formatDate(e.publication_date)} · {OPEN_STATUS_LABEL[e.status] ?? e.status} · {e.item_count} matéria(s)
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={!editionId || busy}
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
            >
              {busy ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">send</span>}
              Incluir na edição
            </button>
            {message && <p className="text-xs text-secondary">{message}</p>}
          </div>
        </>
      )}

      {status === "approved" && !canCompose && (
        <p className="text-body-sm text-on-surface-variant">
          A matéria está <strong>aprovada</strong> e aguarda inclusão em uma edição pelo responsável
          pela diagramação (edição aberta). O Diário Oficial só é publicado quando a edição é fechada,
          o PDF é gerado, assinado e publicado.
        </p>
      )}

      {confirmOpen && selectedEdition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="publish-confirm-title" className="relative z-10 bg-surface-container-lowest rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary-fixed text-on-primary-fixed-variant">
                <span className="material-symbols-outlined" aria-hidden="true">public</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="publish-confirm-title" className="text-lg font-semibold text-on-surface">Publicar matéria</h3>
                <p className="text-sm text-on-surface-variant mt-1 break-words">{matterTitle}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-on-surface-variant">Edição:</dt>
                    <dd className="font-medium text-on-surface text-right">
                      nº {selectedEdition.number}/{selectedEdition.year} — {formatDate(selectedEdition.publication_date)}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-on-surface-variant mt-3">
                  Após incluída na edição, alterações poderão ser restringidas conforme as regras do
                  Diário Oficial. A publicação oficial ocorre quando a edição é fechada, o PDF gerado,
                  assinado e publicado.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5 justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold text-on-primary bg-secondary rounded-lg transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Incluindo…" : "Confirmar inclusão"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
