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
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-full ${destructive ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
            <AlertTriangle size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="confirm-title" className="text-lg font-semibold text-gray-900">{title}</h2>
            <p id="confirm-message" className="mt-1 text-sm text-gray-600">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white ${destructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-700 hover:bg-blue-800"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
