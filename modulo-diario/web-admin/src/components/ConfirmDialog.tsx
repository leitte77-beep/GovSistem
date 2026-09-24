"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Diálogo de confirmação acessível (focus trap, Escape, volta de foco). */
export default function ConfirmDialog({
  open, title, message, confirmLabel, cancelLabel = "Cancelar",
  destructive = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Tab") {
        const els = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        if (els.length < 2) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" aria-hidden="true" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="relative w-full max-w-md animate-fade-up rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-pop"
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${destructive ? "bg-error-container text-error" : "bg-primary-fixed text-primary"}`}>
            <AlertTriangle size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="confirm-title" className="text-headline-sm text-on-surface">{title}</h2>
            <p id="confirm-message" className="mt-1 text-body-md text-on-surface-variant">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <button ref={cancelRef} onClick={onCancel} className="btn-outline">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`btn ${destructive ? "bg-error text-on-error hover:bg-[#B42318]" : "bg-primary text-on-primary hover:bg-primary-container"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
