"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type { DocumentField, PreviewResult } from "@/types/document_model";

interface Props {
  open: boolean;
  onClose: () => void;
  modelId: string;
  version: number;
  fields: DocumentField[];
}

function sampleValue(field: DocumentField): string {
  switch (field.type) {
    case "date":
      return "01/09/2026";
    case "integer":
      return "30";
    case "decimal":
      return "10,5";
    case "money":
      return "1.500,00";
    case "select":
      return field.options?.[0] ?? "";
    default:
      return "JOÃO DA SILVA";
  }
}

export default function PreviewModal({ open, onClose, modelId, version, fields }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const urlRef = useRef<string | null>(null);

  const revoke = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    fields.forEach((f) => {
      initial[f.key] = sampleValue(f);
    });
    setValues(initial);
    setResult(null);
    setError(null);
    setPdfUrl(null);
    revoke();
    return revoke;
  }, [open, fields]); // eslint-disable-line react-hooks/exhaustive-deps

  useEscapeKey(open, onClose);

  if (!open) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const [preview, blob] = await Promise.all([
        api.previewVersion(modelId, version, values),
        api.renderVersionPdf(modelId, version, values),
      ]);
      setResult(preview);
      revoke();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPdfUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar a prévia.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Testar modelo"
        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Testar modelo</h2>
            <p className="text-xs text-gray-500">
              Preencha dados fictícios; o PDF abaixo é idêntico à publicação.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-5 lg:grid-cols-[320px_1fr]">
          <div className="overflow-auto">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Dados de teste
            </h3>
            {fields.length === 0 ? (
              <p className="text-sm text-gray-400">O modelo não possui campos.</p>
            ) : (
              <div className="space-y-2">
                {fields.map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-gray-600">{f.label}</span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Gerando…" : "Gerar prévia (PDF)"}
            </button>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            {result && result.pending.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                {result.pending.length} pendência(s):{" "}
                {result.pending.map((p) => p.field || p.code).join(", ")}
              </div>
            )}
            {result && (
              <button
                type="button"
                onClick={() => setShowText((s) => !s)}
                className="mt-3 text-xs text-blue-600 hover:underline"
              >
                {showText ? "Ocultar texto" : "Ver texto canônico"}
              </button>
            )}
            {showText && result && (
              <pre className="mt-2 max-h-[35vh] overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800">
                {result.canonical_text || "(sem texto)"}
              </pre>
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pré-visualização
            </h3>
            {pdfUrl ? (
              <iframe
                title="Pré-visualização do documento"
                src={pdfUrl}
                className="min-h-[60vh] w-full flex-1 rounded-lg border border-gray-200"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400">
                Clique em “Gerar prévia (PDF)”.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
