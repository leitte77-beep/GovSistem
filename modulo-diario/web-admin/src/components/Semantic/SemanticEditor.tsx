"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import clsx from "clsx";

import { semanticApi } from "@/lib/semanticApi";
import {
  duplicateBlock,
  insertBlockAfter,
  moveBlock,
  removeBlock,
  updateBlock,
} from "@/lib/semanticBlocks";
import { blockToHtml } from "@/lib/semanticRender";
import type {
  IntegrityReport,
  SemanticAnalyzeResponse,
  SemanticBlock,
  SemanticBlockType,
  SemanticDocument,
  ValidationReport,
} from "@/types/semantic";
import { SEMANTIC_BLOCK_LABELS, SEMANTIC_BLOCK_ORDER } from "@/types/semantic";
import BlockEditor from "./BlockEditor";

interface Props {
  matterId?: string;
  title?: string;
  summary?: string;
  documentType?: string;
  html?: string;
  plain?: string;
  onSaved?: (doc: SemanticDocument) => void;
  /** Reports semantic analysis state so the wizard can show a clear status. */
  onStatusChange?: (status: {
    analyzed: boolean;
    pendingBlocks: number;
    errors: number;
    warnings: number;
    loading: boolean;
  }) => void;
}

const sourceCls =
  "w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-body-sm font-mono focus:ring-2 focus:ring-primary outline-none min-h-[160px]";

export default function SemanticEditor({
  matterId,
  title = "",
  summary = "",
  documentType = "ato_oficial",
  html,
  plain,
  onSaved,
  onStatusChange,
}: Props) {
  const [sourceHtml, setSourceHtml] = useState(html ?? "");
  const [sourcePlain, setSourcePlain] = useState(plain ?? "");
  const [doc, setDoc] = useState<SemanticDocument | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [viewMode, setViewMode] = useState<"blocks" | "html">("blocks");
  const [currentVersion, setCurrentVersion] = useState<number | undefined>(undefined);
  const [conflict, setConflict] = useState(false);

  const loadExisting = useCallback(async () => {
    if (!matterId) return;
    setLoadingSaved(true);
    try {
      const res = await semanticApi.get(matterId);
      setDoc(res.document);
      if (res.version) setCurrentVersion(res.version);
      toast.success("Documento semântico carregado");
    } catch {
      /* no semantic content yet — that's fine */
    } finally {
      setLoadingSaved(false);
    }
  }, [matterId]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const handleAnalyze = async () => {
    if (!matterId) {
      toast.error("Salve a matéria antes de analisar");
      return;
    }
    if (!sourceHtml.trim() && !sourcePlain.trim()) {
      toast.error("Cole ou digite o conteúdo para analisar");
      return;
    }
    setAnalyzing(true);
    try {
      const res: SemanticAnalyzeResponse = await semanticApi.analyze(matterId, {
        html: sourceHtml || null,
        plain: sourcePlain || null,
        title,
        summary,
        document_type: documentType,
      });
      setDoc(res.document);
      setIntegrity(res.integrity);
      setValidation(res.validation);
      const pending = res.document.blocks.filter((b) => !b.confirmed).length;
      if (pending > 0) {
        toast(`${pending} bloco(s) aguardando confirmação`, { icon: "⚠️" });
      } else {
        toast.success("Documento analisado e organizado");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao analisar");
    } finally {
      setAnalyzing(false);
    }
  };

  const confirmBlock = (id: string, confirmed: boolean) => {
    setDoc((d) => (d ? updateBlock(d, id, { confirmed }) : d));
  };

  const changeType = (id: string, type: SemanticBlockType) => {
    setDoc((d) => {
      if (!d) return d;
      const block = d.blocks.find((b) => b.id === id);
      if (!block) return d;
      const base = { ...block, type } as SemanticBlock;
      return updateBlock(d, id, base);
    });
  };

  const handleSave = async (confirmAll: boolean) => {
    if (!matterId || !doc) return;
    setSaving(true);
    setConflict(false);
    try {
      const document = confirmAll
        ? { ...doc, blocks: doc.blocks.map((b) => ({ ...b, confirmed: true })) }
        : doc;
      const res = await semanticApi.save(matterId, { document, confirm_all: confirmAll }, currentVersion);
      setDoc(res.document);
      setValidation(res.validation);
      if (res.version) setCurrentVersion(res.version);
      toast.success("Documento semântico salvo");
      onSaved?.(res.document);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        setConflict(true);
        toast.error("Conflito de edição: recarregue o documento para continuar.");
      } else {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      }
    } finally {
      setSaving(false);
    }
  };

  const reloadDocument = async () => {
    setConflict(false);
    await loadExisting();
  };

  const pendingCount = doc?.blocks.filter((b) => !b.confirmed).length ?? 0;
  const blockingErrors = validation?.errors.filter((e) => e.severity === "error") ?? [];

  useEffect(() => {
    onStatusChange?.({
      analyzed: !!doc,
      pendingBlocks: pendingCount,
      errors: blockingErrors.length,
      warnings: validation?.warnings.length ?? 0,
      loading: loadingSaved,
    });
  }, [doc, pendingCount, blockingErrors.length, validation, loadingSaved, onStatusChange]);

  return (
    <div className="space-y-5">
      {/* Step A: source input */}
      <div className="rounded-2xl border border-outline-variant bg-surface-bright p-5">
        <h4 className="text-label-md font-label-md text-on-surface-variant mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[18px]">content_paste_go</span>
          FONTE DO DOCUMENTO
        </h4>
        <div className="space-y-3">
          <div>
            <label className="block text-label-md font-label-md text-on-surface-variant mb-1" htmlFor="sem-html">HTML (colagem Word/rich)</label>
            <textarea id="sem-html" className={sourceCls} value={sourceHtml}
              onChange={(e) => setSourceHtml(e.target.value)}
              placeholder="Cole aqui o HTML do documento (Word, navegador)…" />
          </div>
          <div>
            <label className="block text-label-md font-label-md text-on-surface-variant mb-1" htmlFor="sem-plain">Texto simples (PDF extraído)</label>
            <textarea id="sem-plain" className={clsx(sourceCls, "min-h-[100px]")} value={sourcePlain}
              onChange={(e) => setSourcePlain(e.target.value)}
              placeholder="Ou o texto simples…" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || !matterId}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow hover:opacity-90 disabled:opacity-50"
            >
              {analyzing ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">auto_awesome</span>}
              Analisar e organizar
            </button>
            {loadingSaved && <span className="text-xs text-on-surface-variant self-center">Carregando…</span>}
          </div>
        </div>
      </div>

      {/* Step B: blocks */}
      {doc && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">data_object</span>
              <h4 className="text-label-md font-label-md text-on-surface-variant">DOCUMENTO ESTRUTURADO</h4>
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] text-on-surface-variant">
                {doc.blocks.length} bloco(s) · schema v{doc.schema_version}
              </span>
            </div>
            <div className="flex gap-1 bg-surface-container-high rounded-lg p-1">
              {(["blocks", "html"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setViewMode(m)}
                  className={clsx("px-3 py-1 text-xs rounded-md", viewMode === m ? "bg-primary text-on-primary" : "text-on-surface-variant")}>
                  {m === "blocks" ? "Blocos" : "HTML"}
                </button>
              ))}
            </div>
          </div>

          {integrity && (
            <div className={clsx("rounded-xl border p-3 text-sm flex items-start gap-2",
              integrity.valid ? "border-secondary/30 bg-secondary-container/20 text-on-secondary-container" : "border-error/40 bg-error-container/30 text-on-error-container")}>
              <span className="material-symbols-outlined text-[18px] shrink-0">
                {integrity.valid ? "verified" : "report"}
              </span>
              <div>
                <strong>Integridade textual: {integrity.valid ? "preservada" : "divergências"}</strong>
                {integrity.total_changed > 0 && (
                  <div className="text-xs mt-1">
                    {integrity.total_changed} alteração(ões) detectada(s).{' '}
                    {integrity.message || "Confira antes de salvar."}
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === "html" ? (
            <div className="rounded-xl border border-outline-variant bg-white p-6 overflow-x-auto prose max-w-none"
              dangerouslySetInnerHTML={{ __html: doc.blocks.map((b) => blockToHtml(b)).join("\n") }} />
          ) : (
            <div className="space-y-3">
              {doc.blocks.map((block, idx) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  isFirst={idx === 0}
                  isLast={idx === doc.blocks.length - 1}
                  onMove={(dir) => setDoc((d) => (d ? moveBlock(d, block.id, dir) : d))}
                  onDuplicate={() => setDoc((d) => (d ? duplicateBlock(d, block.id) : d))}
                  onRemove={() => setDoc((d) => (d ? removeBlock(d, block.id) : d))}
                  onInsert={(type) => setDoc((d) => (d ? insertBlockAfter(d, block.id, type) : d))}
                  onConfirm={(confirmed) => confirmBlock(block.id, confirmed)}
                  onChangeType={(type) => changeType(block.id, type)}
                  onChange={(patch) => setDoc((d) => (d ? updateBlock(d, block.id, patch) : d))}
                />
              ))}
              <button type="button"
                onClick={() => setDoc((d) => (d ? insertBlockAfter(d, null, "paragraph") : d))}
                className="w-full border border-dashed border-outline-variant rounded-xl py-3 text-sm text-on-surface-variant hover:border-primary hover:text-primary">
                + Inserir bloco no final
              </button>
            </div>
          )}

          {conflict && (
            <div role="alert" className="rounded-xl border border-error/40 bg-error-container/30 p-4 text-sm text-on-error-container flex items-start gap-3">
              <span className="material-symbols-outlined text-[18px] shrink-0">sync_problem</span>
              <div className="flex-1">
                <strong>Conflito de edição</strong>
                <p className="text-xs mt-0.5">A matéria foi alterada em outra aba ou sessão. Recarregue para continuar sem sobrescrever mudanças alheias.</p>
              </div>
              <button type="button" onClick={reloadDocument}
                className="rounded-lg bg-on-error-container text-error-container px-3 py-1.5 text-xs font-semibold hover:opacity-90">
                Recarregar
              </button>
            </div>
          )}

          {validation && (
            <ValidationPanel validation={validation} pendingCount={pendingCount} />
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" onClick={() => handleSave(false)} disabled={saving || blockingErrors.length > 0}
              title={blockingErrors.length ? "Corrija os erros antes de salvar" : undefined}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow hover:opacity-90 disabled:opacity-40">
              {saving ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">save</span>}
              Salvar documento semântico
            </button>
            <button type="button" onClick={() => handleSave(true)} disabled={saving || blockingErrors.length > 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border-2 border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-40">
              <span className="material-symbols-outlined text-[18px]">task_alt</span>
              Confirmar todos e salvar ({pendingCount} pendentes)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BlockCard(props: {
  block: SemanticBlock;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onInsert: (type: SemanticBlockType) => void;
  onConfirm: (confirmed: boolean) => void;
  onChangeType: (type: SemanticBlockType) => void;
  onChange: (patch: Partial<SemanticBlock>) => void;
}) {
  const { block } = props;
  const lowConfidence = (block.confidence ?? 1) < 0.7;
  return (
    <div className={clsx(
      "rounded-xl border bg-surface-bright overflow-hidden",
      block.confirmed ? "border-outline-variant" : lowConfidence ? "border-warning/50" : "border-primary/40"
    )}>
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-container-high flex-wrap">
        <span className="text-[10px] text-on-surface-variant w-6 text-right">#{block.order + 1}</span>
        <select
          aria-label="Tipo do bloco"
          value={block.type}
          onChange={(e) => props.onChangeType(e.target.value as SemanticBlockType)}
          className="bg-transparent text-label-md font-label-md text-primary font-semibold outline-none cursor-pointer"
        >
          {SEMANTIC_BLOCK_ORDER.map((t) => (
            <option key={t} value={t}>{SEMANTIC_BLOCK_LABELS[t]}</option>
          ))}
        </select>

        {lowConfidence && !block.confirmed && (
          <span className="flex items-center gap-1 text-[10px] text-warning font-medium">
            <span className="material-symbols-outlined text-[12px]">help</span> baixa confiança
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn label="Mover para cima" icon="arrow_upward" onClick={() => props.onMove(-1)} disabled={props.isFirst} />
          <IconBtn label="Mover para baixo" icon="arrow_downward" onClick={() => props.onMove(1)} disabled={props.isLast} />
          <IconBtn label="Duplicar" icon="content_copy" onClick={props.onDuplicate} />
          <IconBtn label="Remover" icon="delete" onClick={props.onRemove} danger />
          <button
            type="button"
            onClick={() => props.onConfirm(!block.confirmed)}
            className={clsx("flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md ml-1",
              block.confirmed ? "bg-secondary text-on-secondary" : "bg-surface-container-low text-on-surface-variant")}
          >
            <span className="material-symbols-outlined text-[14px]">{block.confirmed ? "task_alt" : "radio_button_unchecked"}</span>
            {block.confirmed ? "Confirmado" : "Confirmar"}
          </button>
        </div>
      </div>

      <div className="p-3">
        <BlockEditor block={block} onChange={props.onChange} />
        <div className="mt-2 flex gap-1 flex-wrap">
          {SEMANTIC_BLOCK_ORDER.slice(0, 8).map((t) => (
            <button key={t} type="button" onClick={() => props.onInsert(t)}
              className="text-[10px] px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant hover:bg-primary/10 hover:text-primary">
              + {SEMANTIC_BLOCK_LABELS[t].split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function IconBtn(props: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={clsx("p-1 rounded-md hover:bg-surface-container-low text-on-surface-variant",
        props.danger && "hover:text-error", props.disabled && "opacity-40 cursor-not-allowed")}
    >
      <span className="material-symbols-outlined text-[16px]">{props.icon}</span>
    </button>
  );
}

function ValidationPanel({ validation, pendingCount }: { validation: ValidationReport; pendingCount: number }) {
  const errors = validation.errors ?? [];
  const warnings = validation.warnings ?? [];
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm space-y-2">
      <div className="flex items-center gap-2 font-semibold text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-secondary">rule</span>
        Validação
      </div>
      {errors.length === 0 && warnings.length === 0 && pendingCount === 0 && (
        <p className="text-secondary text-xs">Documento válido e com blocos confirmados.</p>
      )}
      {errors.map((e, i) => (
        <p key={`e${i}`} className="flex items-start gap-2 text-error text-xs"><span className="material-symbols-outlined text-[14px]">error</span>{e.message}</p>
      ))}
      {warnings.map((w, i) => (
        <p key={`w${i}`} className="flex items-start gap-2 text-warning text-xs"><span className="material-symbols-outlined text-[14px]">warning</span>{w.message}</p>
      ))}
      {pendingCount > 0 && (
        <p className="flex items-start gap-2 text-on-surface-variant text-xs"><span className="material-symbols-outlined text-[14px]">radio_button_unchecked</span>
          {pendingCount} bloco(s) ainda não confirmado(s) — necessário antes de revisão.
        </p>
      )}
    </div>
  );
}
