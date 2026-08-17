"use client";

import { useEffect } from "react";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-surface-container-lowest rounded-lg shadow-xl p-6">
        <h3 className="text-headline-sm font-headline-sm text-on-surface">{title}</h3>
        <p className="mt-2 text-body-md text-on-surface-variant">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-10 px-4 text-label-md font-label-md border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
            className={`h-10 px-4 text-label-md font-label-md rounded-lg text-on-primary transition-colors disabled:opacity-60 ${
              danger ? "bg-error hover:opacity-90" : "bg-primary hover:bg-primary-container"
            }`}
          >
            {loading ? "Aguarde…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
