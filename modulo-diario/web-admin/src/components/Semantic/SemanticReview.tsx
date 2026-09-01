"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { semanticApi } from "@/lib/semanticApi";
import { documentToHtml } from "@/lib/semanticRender";
import { SEMANTIC_BLOCK_LABELS } from "@/types/semantic";
import type { SemanticDocument, ValidationReport } from "@/types/semantic";

interface Props {
  matterId?: string;
  onLoadState?: (s: { loaded: boolean; confirmed: boolean; valid: boolean }) => void;
}

/** Fase 4 — revisor visualiza o MESMO SemanticDocument salvo, read-only,
 * usando o mesmo renderizador semântico (documentToHtml). */
export default function SemanticReview({ matterId, onLoadState }: Props) {
  const [doc, setDoc] = useState<SemanticDocument | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!matterId) {
      setLoadError("Conteúdo não carregado.");
      onLoadState?.({ loaded: false, confirmed: false, valid: false });
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const res = await semanticApi.get(matterId);
      setDoc(res.document);
      setVersion(res.version ?? null);
      const confirmedAll = res.document.blocks.every((b) => b.confirmed);
      setValidation(null);
      onLoadState?.({ loaded: true, confirmed: confirmedAll, valid: true });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar revisão");
      onLoadState?.({ loaded: false, confirmed: false, valid: false });
    } finally {
      setLoading(false);
    }
  }, [matterId, onLoadState]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        <span className="text-sm">Carregando revisão…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-error/40 bg-error-container/30 p-4 text-sm text-on-error-container flex items-start gap-2">
        <span className="material-symbols-outlined text-[18px]">error</span>
        <div>
          <strong>Falha ao carregar a revisão</strong>
          <p className="text-xs mt-0.5">{loadError}</p>
          <button type="button" onClick={load} className="mt-2 text-xs font-semibold underline">Tentar novamente</button>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  const confirmedAll = doc.blocks.every((b) => b.confirmed);
  const pending = doc.blocks.filter((b) => !b.confirmed);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-xs text-on-surface-variant">
        <div><span className="block uppercase tracking-wide opacity-70">Schema</span><span className="font-semibold">v{doc.schema_version}</span></div>
        <div><span className="block uppercase tracking-wide opacity-70">Revisão</span><span className="font-semibold">v{version ?? "—"}</span></div>
        <div><span className="block uppercase tracking-wide opacity-70">Blocos</span><span className="font-semibold">{doc.blocks.length}</span></div>
        <div><span className="block uppercase tracking-wide opacity-70">Integridade</span>
          <span className={doc.text_integrity_hash ? "text-secondary" : "text-on-surface-variant"}>
            {doc.text_integrity_hash ? "verificada" : "—"}
          </span>
        </div>
      </div>

      {!confirmedAll && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Aprovação bloqueada:</strong> {pending.length} bloco(s) sem confirmação humana
          ({pending.map((b) => SEMANTIC_BLOCK_LABELS[b.type]).join(", ")}).
        </div>
      )}

      {validation && !validation.valid && (
        <div className="rounded-xl border border-error/40 bg-error-container/30 p-3 text-xs text-on-error-container">
          <strong>Documento inválido:</strong> {validation.errors.map((e) => e.message).join("; ")}
        </div>
      )}

      <div className="rounded-xl border border-outline-variant bg-white p-6 overflow-x-auto prose max-w-none"
        dangerouslySetInnerHTML={{ __html: documentToHtml(doc) }} />
    </div>
  );
}
