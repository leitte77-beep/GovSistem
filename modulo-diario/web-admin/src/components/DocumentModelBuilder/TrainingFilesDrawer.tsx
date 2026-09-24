"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type { LearnProposal, TrainingFile } from "@/types/document_model";

interface Props {
  open: boolean;
  onClose: () => void;
  modelId: string;
  canTrain: boolean;
  onApplied: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Enviado",
  analyzed: "Analisado",
  empty: "Sem texto",
  failed: "Falhou",
  rejected: "Rejeitado",
};

export default function TrainingFilesDrawer({ open, onClose, modelId, canTrain, onApplied }: Props) {
  const [files, setFiles] = useState<TrainingFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<LearnProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await api.listTrainingFiles(modelId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    if (open) {
      setProposal(null);
      setError(null);
      load();
    }
  }, [open, load]);

  useEscapeKey(open, onClose);

  if (!open) return null;

  const eligibleCount = files.filter((f) => f.has_text).length;
  const markedCount = files.filter((f) => f.used_by_ai).length;
  const canAnalyze = canTrain && markedCount > 0;

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        await api.uploadTrainingFile(modelId, file);
      }
      toast.success("Documento(s) adicionado(s).");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggleUsed = async (file: TrainingFile) => {
    try {
      const updated = await api.updateTrainingFile(modelId, file.id, {
        used_by_ai: !file.used_by_ai,
      });
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar.");
    }
  };

  const markAllUsed = async () => {
    const targets = files.filter((f) => f.has_text && !f.used_by_ai);
    if (targets.length === 0) return;
    setBusy(true);
    try {
      const updated = [...files];
      for (const file of targets) {
        const result = await api.updateTrainingFile(modelId, file.id, { used_by_ai: true });
        const idx = updated.findIndex((f) => f.id === result.id);
        if (idx >= 0) updated[idx] = result;
      }
      setFiles(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao marcar documentos.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (file: TrainingFile) => {
    if (!window.confirm(`Remover o documento "${file.filename}"?`)) return;
    try {
      await api.deleteTrainingFile(modelId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover.");
    }
  };

  const analyze = async () => {
    if (markedCount === 0) {
      setError(
        eligibleCount === 0
          ? "Nenhum documento possui texto extraído. Envie PDF/DOCX com texto (digitalizado não é suportado)."
          : "Marque ao menos um documento como “Usado pela IA” antes de analisar."
      );
      return;
    }
    setBusy(true);
    setError(null);
    setProposal(null);
    try {
      const result = await api.proposeFromTrainingFiles(modelId);
      setProposal(result);
      if (!result.ok) {
        setError(result.message || "A IA não conseguiu analisar os documentos.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao analisar.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!proposal?.config) return;
    setBusy(true);
    try {
      const created = await api.createModelVersion(modelId, {
        config: proposal.config,
        change_reason: "Modelo proposto pela IA (aprovado pelo administrador)",
      });
      toast.success(`Proposta aprovada: rascunho v${created.version_number} criado.`);
      setProposal(null);
      onClose();
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aplicar a proposta.");
    } finally {
      setBusy(false);
    }
  };

  const cfg = proposal?.config;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Aprender com documentos"
        className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Aprender com documentos</h2>
            <p className="text-xs text-gray-500">
              Envie documentos oficiais reais; a IA propõe a estrutura. A aprovação é sempre manual.
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

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {canTrain ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx"
                multiple
                disabled={busy}
                onChange={(e) => onFiles(e.target.files)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-blue-700"
              />
              <p className="mt-2 text-xs text-gray-400">PDF ou DOCX · vários arquivos</p>
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Você não tem permissão para treinar a IA com documentos.
            </p>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Documentos de referência
              </h3>
              {canTrain && eligibleCount > markedCount && (
                <button
                  type="button"
                  onClick={markAllUsed}
                  disabled={busy}
                  className="text-xs font-medium text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50"
                >
                  Marcar todos como usados
                </button>
              )}
            </div>
            {loading ? (
              <p className="text-sm text-gray-400">Carregando…</p>
            ) : files.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum documento enviado.</p>
            ) : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800">{f.filename}</div>
                      <div className="text-xs text-gray-500">
                        {STATUS_LABEL[f.status] ?? f.status}
                        {f.size_bytes ? ` · ${Math.round(f.size_bytes / 1024)} KB` : ""}
                      </div>
                      {!f.has_text && (
                        <div className="mt-0.5 text-xs text-amber-700">
                          Sem texto extraído — não pode ser usado pela IA
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={f.used_by_ai}
                          disabled={!canTrain || !f.has_text}
                          onChange={() => toggleUsed(f)}
                        />
                        Usado pela IA
                      </label>
                      {canTrain && (
                        <button
                          type="button"
                          onClick={() => remove(f)}
                          aria-label="Remover"
                          className="rounded p-0.5 text-red-500 hover:bg-red-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {cfg && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="text-sm font-semibold text-blue-900">Modelo identificado pela IA</h3>
              <p className="mt-1 text-xs text-blue-800">
                {cfg.document_title || cfg.purpose} · {cfg.fields.length} campo(s) ·{" "}
                {cfg.sections.length} bloco(s) · fontes: {proposal?.sources.join(", ")}
              </p>
              <div className="mt-3 max-h-52 overflow-auto rounded border border-blue-100 bg-white p-2 text-xs">
                <div className="mb-1 font-semibold text-gray-700">
                  {cfg.document_title || "(sem título)"}
                </div>
                {cfg.sections.map((s) => (
                  <div key={s.id} className="border-t border-gray-100 py-1 text-gray-600">
                    <span className="mr-1 rounded bg-gray-100 px-1 text-[10px] uppercase">
                      {s.kind}
                    </span>
                    {s.text || "(vazio)"}
                  </div>
                ))}
                {cfg.fields.length > 0 && (
                  <div className="mt-2 text-gray-500">
                    Campos: {cfg.fields.map((f) => f.label).join(", ")}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={apply}
                disabled={busy}
                className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Aprovar modelo (criar rascunho)
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3">
          <p className="text-xs text-gray-500">
            {canTrain && markedCount === 0
              ? eligibleCount === 0
                ? "Nenhum documento com texto extraído."
                : "Marque os documentos que a IA deve usar."
              : `${markedCount} documento(s) marcado(s) para a IA.`}
          </p>
          <button
            type="button"
            onClick={analyze}
            disabled={busy || !canAnalyze}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            {busy ? "Analisando…" : "Analisar com IA"}
          </button>
        </div>
      </div>
    </div>
  );
}
