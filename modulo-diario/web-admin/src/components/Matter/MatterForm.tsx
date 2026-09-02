"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import clsx from "clsx";

import Editor from "@/components/Editor";
import SemanticEditor from "@/components/Semantic/SemanticEditor";
import SemanticReview from "@/components/Semantic/SemanticReview";
import AttachmentUpload from "./AttachmentUpload";
import StatusHistory from "./StatusHistory";
import StatusBadge from "./StatusBadge";
import MatterContentPreview from "./MatterContentPreview";
import ActTypePicker from "./ActTypePicker";
import OrgUnitSelect from "./OrgUnitSelect";
import MatterSidePanel, { type SaveState, type SemanticStatus } from "./MatterSidePanel";
import PublishSection from "./PublishSection";
import Breadcrumbs from "@/components/Breadcrumbs";
import { sanitizeHtml } from "@/lib/sanitize";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { useAuth } from "@/lib/auth-context";
import {
  identificationWarnings,
  parseTitleMetadata,
  suggestTitle,
  actTypeConfig,
} from "@/lib/actTitle";
import type { ActType, Attachment, Matter, MatterListItem, MatterStatus, OrgUnit } from "@/types/matter";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9201/api/v1";
const API_HOST = API_URL.replace(/\/api\/v1\/?$/, "");

function fixImageUrls(html: string): string {
  return html.replace(/http:\/\/api:8000/g, API_HOST);
}

interface MatterFormProps {
  matter?: Matter;
  isNew?: boolean;
  initialStep?: number;
}

const AUTOSAVE_KEY = "doe-matter-draft";

const STEPS = [
  { num: 1, label: "IDENTIFICAÇÃO" },
  { num: 2, label: "DOCUMENTO" },
  { num: 3, label: "REVISÃO E PUBLICAÇÃO" },
];

export default function MatterForm({ matter, isNew, initialStep }: MatterFormProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(initialStep || 1);

  // ── Identificação ────────────────────────────────────────────────────────
  const [title, setTitle] = useState(matter?.title ?? "");
  const [summary, setSummary] = useState(matter?.summary ?? "");
  const [actTypeId, setActTypeId] = useState(matter?.act_type_id ?? "");
  const [actNumber, setActNumber] = useState(matter?.act_number ?? "");
  const [actYear, setActYear] = useState<number | "">(matter?.act_year ?? "");
  const [actDate, setActDate] = useState<string>(matter?.act_date ?? "");
  const [responsibleName, setResponsibleName] = useState(matter?.responsible_name ?? "");
  const [responsibleRole, setResponsibleRole] = useState(matter?.responsible_role ?? "");
  const [publicationType, setPublicationType] = useState(matter?.publication_type ?? "normal");
  const [referencesMatterId, setReferencesMatterId] = useState(matter?.references_matter_id ?? "");
  const [refSearch, setRefSearch] = useState("");
  const [refResults, setRefResults] = useState<MatterListItem[]>([]);
  const [refSearching, setRefSearching] = useState(false);
  const [orgUnitId, setOrgUnitId] = useState(matter?.org_unit_id ?? "");
  const [titleManual, setTitleManual] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);

  // ── Conteúdo ─────────────────────────────────────────────────────────────
  const [contentHtml, setContentHtml] = useState(matter?.content_html ? fixImageUrls(matter.content_html) : "");
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(matter?.content_json ?? null);
  const [contentMode, setContentMode] = useState<"rich_text" | "pdf" | "semantic" | "legacy_html" | "original_pdf">(matter?.content_mode ?? "rich_text");
  const [status, setStatus] = useState<MatterStatus>(matter?.status ?? "draft");
  const [attachments, setAttachments] = useState<Attachment[]>(matter?.attachments ?? []);
  const [actTypes, setActTypes] = useState<ActType[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [contentPdfName, setContentPdfName] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [cleanWarnings, setCleanWarnings] = useState<string[]>([]);
  const [semanticMode, setSemanticMode] = useState(matter?.content_mode === "semantic");
  const [hasSemantic, setHasSemantic] = useState(matter?.content_mode === "semantic");
  const [semanticStatus, setSemanticStatus] = useState<MatterSidePanelProps["semantic"]["status"]>(null);
  const [reviewState, setReviewState] = useState<{ loaded: boolean; confirmed: boolean; valid: boolean }>({
    loaded: false, confirmed: false, valid: true,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const draftLoaded = useRef(false);
  const [createdId, setCreatedId] = useState<string>("");

  // ── Autosave de servidor (com confirmação do backend) ────────────────────
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastSavedSnapshot = useRef<string>("");
  const dirty = useRef(false);

  const isEditable = status === "draft" || status === "review" || status === "rejected";
  const selectedActType = actTypes.find((a) => a.id === actTypeId);
  const matterId = matter?.id || createdId;
  const typeCfg = actTypeConfig(selectedActType?.config);
  const suggestedTitle = selectedActType
    ? suggestTitleLocal(selectedActType, actNumber, actYear ? Number(actYear) : null)
    : "";

  useEffect(() => {
    api.listActTypes().then(setActTypes).catch((err) => notifyError("MatterForm.listActTypes", err));
    api.listOrgUnits().then(setOrgUnits).catch((err) => notifyError("MatterForm.listOrgUnits", err));
  }, []);

  // Local draft restore (new matters only, before first backend save)
  useEffect(() => {
    if (!matter && !draftLoaded.current) {
      draftLoaded.current = true;
      try {
        const saved = localStorage.getItem(AUTOSAVE_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.title || data.summary || data.content_html) {
            setTitle(data.title ?? "");
            setSummary(data.summary ?? "");
            setActTypeId(data.act_type_id ?? "");
            setActNumber(data.act_number ?? "");
            setActYear(data.act_year ?? "");
            setActDate(data.act_date ?? "");
            setResponsibleName(data.responsible_name ?? "");
            setResponsibleRole(data.responsible_role ?? "");
            setPublicationType(data.publication_type ?? "normal");
            setOrgUnitId(data.org_unit_id ?? "");
            setContentHtml(data.content_html ?? "");
            setContentJson(data.content_json ?? null);
            setContentMode(data.content_mode ?? "rich_text");
            toast.success("Rascunho local restaurado");
          }
        }
      } catch { /* ignore */ }
    }
  }, [matter]);

  // Local draft persistence (debounced) while the matter has no backend ID
  useEffect(() => {
    if (isNew && isEditable && !matterId) {
      const timer = setTimeout(() => {
        localStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({
            title, summary, act_type_id: actTypeId, org_unit_id: orgUnitId,
            act_number: actNumber, act_year: actYear, act_date: actDate,
            responsible_name: responsibleName, responsible_role: responsibleRole,
            publication_type: publicationType,
            content_html: contentHtml, content_json: contentJson, content_mode: contentMode,
          })
        );
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isNew, isEditable, matterId, title, summary, actTypeId, actNumber, actYear, actDate, responsibleName, responsibleRole, publicationType, orgUnitId, contentHtml, contentJson, contentMode]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current || saveState === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState]);

  // ── Validation ───────────────────────────────────────────────────────────
  const errors: Record<string, string> = {};
  if (touched.title && !title.trim()) errors.title = "O título é obrigatório";
  if (touched.actType && !actTypeId) errors.actType = "Selecione o tipo do ato";
  if (touched.summary && !summary.trim()) errors.summary = "A súmula é obrigatória";
  const hasContent = contentHtml && contentHtml !== "<p></p>";
  if (touched.content && !hasContent) errors.content = "O conteúdo é obrigatório";
  const needsReference = publicationType === "rectification" || publicationType === "republication";
  if (touched.reference && needsReference && !referencesMatterId) errors.reference = "Selecione a publicação original";

  const warnings = dismissedWarnings
    ? []
    : identificationWarnings({
        actTypeName: selectedActType?.name ?? null,
        actNumber: actNumber || null,
        actYear: actYear ? Number(actYear) : null,
        title,
      });

  const isValid = !errors.title && !errors.actType && !errors.content && !errors.reference;

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      if (!title.trim()) { toast.error("Digite o título da matéria"); return false; }
      if (!actTypeId) { toast.error("Selecione o tipo do ato"); return false; }
      if (!summary.trim()) { toast.error("Escreva a súmula da matéria"); return false; }
      if (typeCfg.number_required && !actNumber.trim()) { toast.error("Informe o número do ato"); return false; }
      if (needsReference && !referencesMatterId) { toast.error("Selecione a publicação original"); return false; }
      return true;
    }
    if (s === 2) {
      if (!hasContent) { toast.error("Escreva o conteúdo da matéria"); return false; }
      return true;
    }
    return true;
  };

  // ── Payload helpers ──────────────────────────────────────────────────────
  const metadataPayload = () => ({
    title: title.trim(),
    summary: summary.trim() || undefined,
    act_type_id: actTypeId,
    org_unit_id: orgUnitId || undefined,
    act_number: actNumber.trim() || undefined,
    act_year: actYear ? Number(actYear) : undefined,
    act_date: actDate || undefined,
    responsible_name: responsibleName.trim() || undefined,
    responsible_role: responsibleRole.trim() || undefined,
    publication_type: publicationType,
    references_matter_id: needsReference && referencesMatterId ? referencesMatterId : undefined,
  });

  const save = useCallback(
    async (action: "draft" | "review") => {
      setTouched({ title: true, actType: true, content: true, reference: true });

      if (!title.trim()) { toast.error("Digite o título da matéria"); return; }
      if (!actTypeId) { toast.error("Selecione o tipo do ato"); return; }
      if (!summary.trim()) { toast.error("Escreva a súmula da matéria"); return; }
      if (!hasContent) { toast.error("Escreva o conteúdo da matéria"); return; }
      if (needsReference && !referencesMatterId) { toast.error("Selecione a publicação original"); return; }

      const { clean, warnings } = sanitizeHtml(contentHtml);
      if (warnings.length > 0) {
        setCleanWarnings(warnings);
        toast(
          <div className="text-sm">
            <strong className="text-yellow-600">Elementos removidos por segurança:</strong>
            <ul className="list-disc pl-4 mt-1">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>,
          { duration: 5000 }
        );
      }

      setSaving(true);
      setSaveState("saving");
      try {
        const payload = {
          ...metadataPayload(),
          content_html: clean,
          content_json: contentMode === "rich_text" ? (contentJson ?? undefined) : undefined,
          content_mode: contentMode,
        };

        let result: Matter;
        if (isNew && !matterId) {
          // First save of a brand-new matter — creates the record.
          result = await api.createMatter(payload);
        } else if (matterId) {
          // Subsequent saves update the existing matter (even in the same
          // session, after the first draft save replaced the URL).
          result = await api.updateMatter(matterId, payload);
        } else {
          return;
        }

        if (action === "review") {
          result = await api.submitReview(result.id);
        }

        setStatus(result.status);
        setLastSavedAt(new Date());
        setSaveState("saved");
        dirty.current = false;
        lastSavedSnapshot.current = JSON.stringify(metadataPayload());
        localStorage.removeItem(AUTOSAVE_KEY);
        toast.success(action === "review" ? "Matéria enviada para revisão!" : "Rascunho salvo com sucesso");

        if (isNew && !matterId) {
          setCreatedId(result.id);
          window.history.replaceState({}, "", `/matters/${result.id}/edit`);
        }
      } catch (err: unknown) {
        setSaveState("error");
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, summary, actTypeId, actNumber, actYear, actDate, responsibleName, responsibleRole, publicationType, referencesMatterId, orgUnitId, contentHtml, contentJson, contentMode, isNew, matter, matterId, hasContent]
  );

  // ── Server autosave (debounced, only after the matter has an ID) ────────
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!matterId || !isEditable || isNew) return;
    const snapshot = JSON.stringify(metadataPayload());
    if (snapshot === lastSavedSnapshot.current) return;
    dirty.current = true;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await api.updateMatter(matterId, metadataPayload());
        lastSavedSnapshot.current = snapshot;
        dirty.current = false;
        setSaveState("saved");
        setLastSavedAt(new Date());
      } catch {
        setSaveState("error");
      }
    }, 3000);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, isNew, title, summary, actTypeId, actNumber, actYear, actDate, responsibleName, responsibleRole, publicationType, referencesMatterId, orgUnitId]);

  const retrySave = useCallback(async () => {
    if (!matterId) return;
    setSaveState("saving");
    try {
      await api.updateMatter(matterId, metadataPayload());
      lastSavedSnapshot.current = JSON.stringify(metadataPayload());
      dirty.current = false;
      setSaveState("saved");
      setLastSavedAt(new Date());
    } catch {
      setSaveState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, title, summary, actTypeId, actNumber, actYear, actDate, responsibleName, responsibleRole, publicationType, referencesMatterId, orgUnitId]);

  // ── Title suggestion ─────────────────────────────────────────────────────
  const applySuggestedTitle = (next: string) => {
    setTitleManual(false);
    setTitle(next);
    setDismissedWarnings(false);
  };

  const handleActTypeSelect = async (actType: ActType) => {
    setActTypeId(actType.id);
    setTouched((p) => ({ ...p, actType: true }));

    if (!isNew || !isEditable) return;

    const year = new Date().getFullYear();
    setGeneratingTitle(true);
    try {
      const next = await api.getNextMatterTitle(actType.id);
      if (!titleManual) {
        setActNumber(String(next.next_number).padStart(2, "0"));
        setActYear(next.year);
        setTitle(suggestTitleLocal(actType, String(next.next_number), next.year));
        setDismissedWarnings(false);
      }
      titleAutoFilledOnce.current = true;
    } catch {
      if (!titleManual) {
        setActYear(year);
        setTitle(suggestTitleLocal(actType, "01", year));
        setActNumber("01");
      }
      titleAutoFilledOnce.current = true;
    } finally {
      setGeneratingTitle(false);
    }
  };

  const titleAutoFilledOnce = useRef(false);

  // Keep structured fields in sync when user edits number/year manually
  useEffect(() => {
    if (!titleManual && selectedActType) {
      const suggestion = suggestTitleLocal(selectedActType, actNumber, actYear ? Number(actYear) : null);
      if (suggestion && suggestion !== title) {
        setTitle(suggestion);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actNumber, actYear, actTypeId, titleManual]);

  // Search original publications for rectification/republication
  useEffect(() => {
    if (!needsReference) return;
    const t = setTimeout(() => {
      if (!refSearch.trim()) { setRefResults([]); return; }
      setRefSearching(true);
      api.listMatters({ search: refSearch.trim(), status: "published", limit: 10 })
        .then(setRefResults)
        .catch(() => setRefResults([]))
        .finally(() => setRefSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [refSearch, needsReference]);

  const legacyMeta = !actNumber && matter ? parseTitleMetadata(matter.title) : null;
  const showLegacyHint = !!legacyHintAvailable(matter);

  const handleApprove = async () => {
    if (!matterId) return;
    setSaving(true);
    try {
      const result = await api.approve(matterId);
      setStatus(result.status);
      toast.success("Matéria aprovada!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!matterId) return;
    setSaving(true);
    try {
      const result = await api.reject(matterId);
      setStatus(result.status);
      toast.success("Matéria rejeitada");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao rejeitar");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    await save("draft");
    router.push("/matters");
  };

  const titleMismatchWarnings = warnings;

  return (
    <div className="overflow-y-auto custom-scrollbar" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="p-gutter pb-24">
        <Breadcrumbs items={[{ label: "Matérias", href: "/matters" }, { label: isNew ? "Nova Matéria" : matter?.title || "Editar Matéria" }]} />

        <div className="mb-stack-md flex items-start gap-4">
          <div className="p-3 bg-secondary-container text-on-secondary-container rounded-xl shadow-sm">
            <span className="material-symbols-outlined text-[32px]">note_add</span>
          </div>
          <div>
            <h2 className="text-headline-md font-headline-md text-primary">
              {isNew ? "Nova Matéria" : "Editar Matéria"}
            </h2>
            <p className="text-on-surface-variant text-body-md">
              {isNew
                ? "Identifique o ato, elabore o documento e revise antes de publicar."
                : `Versão ${matter?.version} · ${new Date(matter!.created_at).toLocaleDateString("pt-BR")}`}
            </p>
          </div>
          {!isNew && matter && (
            <div className="ml-auto flex items-center gap-2">
              <StatusBadge status={status} size="sm" />
            </div>
          )}
        </div>

        {/* Stepper */}
        <div className="max-w-4xl mx-auto mb-stack-lg bg-surface-bright rounded-2xl p-6 shadow-sm border border-outline-variant">
          <ol className="flex items-center justify-between list-none">
            {STEPS.map((s, idx) => {
              const state = s.num === step ? "active" : s.num < step ? "done" : "todo";
              return (
                <li key={s.num} className="flex flex-col items-center gap-2 flex-1 relative">
                  <button
                    type="button"
                    aria-current={s.num === step ? "step" : undefined}
                    aria-label={`Etapa ${s.num}: ${s.label}`}
                    onClick={() => {
                      if (s.num < step || matterId) setStep(s.num);
                      else if (s.num > step && validateStep(step)) setStep(s.num);
                    }}
                    disabled={s.num === step}
                    className="flex flex-col items-center gap-2 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-xl px-2 py-1 disabled:cursor-default"
                  >
                    <span className={clsx(
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold z-10 transition-all",
                      state === "active" && "bg-primary text-on-primary",
                      state === "done" && "bg-secondary text-on-secondary",
                      state === "todo" && "bg-surface-container-high text-on-surface-variant border border-outline-variant"
                    )}>
                      {state === "done" ? (
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">check</span>
                      ) : (
                        s.num
                      )}
                    </span>
                    <span className={clsx(
                      "text-label-md font-label-md",
                      state === "active" ? "text-primary" : state === "done" ? "text-secondary" : "text-on-surface-variant"
                    )}>
                      {s.label}
                    </span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div aria-hidden="true" className={clsx(
                      "absolute top-5 left-1/2 w-full h-[2px] transition-colors",
                      s.num < step ? "bg-secondary" : "bg-outline-variant"
                    )} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {cleanWarnings.length > 0 && (
          <div className="mb-6 p-4 bg-error-container/30 border border-error/20 rounded-xl flex items-start gap-3 text-sm text-on-error-container">
            <span className="material-symbols-outlined shrink-0 mt-0.5">warning</span>
            <div>
              <strong className="font-semibold">Elementos removidos por segurança:</strong>
              <ul className="list-disc pl-4 mt-1">
                {cleanWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* Step 1: IDENTIFICAÇÃO */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter items-start">
            <div className="lg:col-span-2 space-y-gutter">
              <div className="bg-surface-bright rounded-2xl p-8 border border-outline-variant shadow-sm">
                <div className="mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">badge</span>
                  <h3 className="text-headline-sm font-headline-sm text-primary">Identificação do Ato</h3>
                </div>
                <div className="space-y-6">
                  {/* Número / Ano / Data */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="act-number" className="block text-label-md font-label-md text-on-surface-variant mb-2">
                        NÚMERO DO ATO {typeCfg.number_required && <span className="text-error">*</span>}
                      </label>
                      <input
                        id="act-number"
                        type="text"
                        inputMode="numeric"
                        className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-md"
                        placeholder="Ex.: 04"
                        value={actNumber}
                        onChange={(e) => { setActNumber(e.target.value); setTouched((p) => ({ ...p, title: true })); }}
                        disabled={!isEditable}
                      />
                    </div>
                    <div>
                      <label htmlFor="act-year" className="block text-label-md font-label-md text-on-surface-variant mb-2">
                        ANO {typeCfg.year_required && <span className="text-error">*</span>}
                      </label>
                      <input
                        id="act-year"
                        type="number"
                        min={1900}
                        max={2200}
                        className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-md"
                        placeholder="Ex.: 2026"
                        value={actYear}
                        onChange={(e) => { setActYear(e.target.value ? Number(e.target.value) : ""); setTouched((p) => ({ ...p, title: true })); }}
                        disabled={!isEditable}
                      />
                    </div>
                    <div>
                      <label htmlFor="act-date" className="block text-label-md font-label-md text-on-surface-variant mb-2">DATA DO ATO</label>
                      <input
                        id="act-date"
                        type="date"
                        className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-md"
                        value={actDate ?? ""}
                        onChange={(e) => setActDate(e.target.value)}
                        disabled={!isEditable}
                      />
                    </div>
                  </div>

                  {/* Título */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="matter-title" className="block text-label-md font-label-md text-on-surface-variant">
                        TÍTULO DA MATÉRIA <span className="text-error">*</span>
                      </label>
                      {!titleManual && suggestedTitle && (
                        <span className="text-[10px] text-on-surface-variant flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                          Título sugerido automaticamente
                        </span>
                      )}
                    </div>
                    <input
                      id="matter-title"
                      aria-describedby="matter-title-hint"
                      className={clsx("w-full h-14 bg-surface-container-lowest border rounded-xl px-4 focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none text-body-md", errors.title ? "border-error bg-error-container/20" : "border-outline-variant")}
                      placeholder="Ex.: PORTARIA Nº 04/2026" type="text" value={title}
                      onChange={(e) => { setTitleManual(true); setTitle(e.target.value); setTouched((p) => ({ ...p, title: true })); }}
                      disabled={!isEditable} maxLength={200} />
                    <div className="flex justify-between mt-1 gap-2">
                      <p id="matter-title-hint" className="text-[10px] text-on-surface-variant">
                        {titleManual && suggestedTitle && suggestedTitle !== title && (
                          <button
                            type="button"
                            onClick={() => applySuggestedTitle(suggestedTitle)}
                            className="text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
                          >
                            Usar título sugerido: {suggestedTitle}
                          </button>
                        )}
                        {!titleManual && selectedActType && "Editável — alterações manuais serão preservadas."}
                      </p>
                      {errors.title ? (
                        <p className="text-xs text-error flex items-center gap-1 shrink-0"><span className="material-symbols-outlined text-xs">warning</span> {errors.title}</p>
                      ) : (
                        <p className="text-[10px] text-on-surface-variant ml-auto shrink-0">{title.length}/200</p>
                      )}
                    </div>
                  </div>

                  {/* Súmula */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="matter-summary" className="block text-label-md font-label-md text-on-surface-variant">
                        SÚMULA <span className="text-error">*</span>
                      </label>
                    </div>
                    <textarea
                      id="matter-summary"
                      aria-describedby="matter-summary-count"
                      className="w-full h-32 bg-surface-container-lowest border border-outline-variant rounded-xl p-4 focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none text-body-md resize-none"
                      placeholder="Breve descrição do conteúdo do ato. Ex.: Exonera a servidora Neide Gomes Caviquioni."
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      disabled={!isEditable} maxLength={500} />
                    <p id="matter-summary-count" className="text-right text-[10px] text-on-surface-variant mt-1">{summary.length}/500</p>
                  </div>
                </div>
              </div>

              {/* Advisory validation */}
              {titleMismatchWarnings.length > 0 && (
                <div className="p-4 bg-surface-container-high border border-outline-variant rounded-xl flex items-start gap-3 text-sm" role="status">
                  <span className="material-symbols-outlined text-amber-600 shrink-0 mt-0.5">warning</span>
                  <div className="flex-1">
                    <strong className="font-semibold text-on-surface block mb-1">Verifique antes de avançar</strong>
                    <ul className="list-disc pl-4 text-on-surface-variant space-y-1">
                      {titleMismatchWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {suggestedTitle && suggestedTitle !== title && (
                        <button type="button" onClick={() => applySuggestedTitle(suggestedTitle)}
                          className="px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-semibold hover:bg-primary-fixed/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                          Corrigir título
                        </button>
                      )}
                      <button type="button" onClick={() => setDismissedWarnings(true)}
                        className="px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface text-xs font-medium hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        Manter como está
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Legacy matter: offer structured extraction */}
              {showLegacyHint && (
                <div className="p-4 bg-surface-container-high border border-outline-variant rounded-xl flex items-start gap-3 text-sm">
                  <span className="material-symbols-outlined text-primary shrink-0 mt-0.5">lightbulb</span>
                  <div className="flex-1">
                    <p className="text-on-surface-variant">
                      Identificamos possível <strong>número {legacyHintAvailable(matter)!.number}</strong> e <strong>ano {legacyHintAvailable(matter)!.year}</strong> no título.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = legacyHintAvailable(matter)!;
                        setActNumber(parsed.number!);
                        setActYear(parsed.year!);
                      }}
                      className="mt-2 px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-semibold hover:bg-primary-fixed/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar — tipo + unidade + responsável + anexos */}
            <div className="space-y-gutter">
              <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                <label className="block text-label-md font-label-md text-on-surface-variant mb-4">TIPO DO ATO <span className="text-error">*</span></label>
                <ActTypePicker
                  actTypes={actTypes}
                  value={actTypeId}
                  onChange={handleActTypeSelect}
                  error={errors.actType}
                  generating={generatingTitle}
                />
              </div>

              <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                <label className="block text-label-md font-label-md text-on-surface-variant mb-4">UNIDADE PUBLICADORA <span className="text-error">*</span></label>
                <OrgUnitSelect orgUnits={orgUnits} value={orgUnitId} onChange={setOrgUnitId} disabled={!isEditable} />
              </div>

              <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                <label className="block text-label-md font-label-md text-on-surface-variant mb-1">RESPONSÁVEL PELO ATO</label>
                <p className="text-[10px] text-on-surface-variant mb-3">
                  Autoridade que assina o ato — não é a pessoa que digitou a matéria.
                </p>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="resp-name" className="sr-only">Nome do responsável</label>
                    <input
                      id="resp-name"
                      type="text"
                      className="w-full h-11 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 text-body-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      placeholder="Ex.: Oclécio de Freitas Meneses"
                      value={responsibleName}
                      onChange={(e) => setResponsibleName(e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div>
                    <label htmlFor="resp-role" className="sr-only">Cargo do responsável</label>
                    <input
                      id="resp-role"
                      type="text"
                      className="w-full h-11 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 text-body-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      placeholder="Cargo — Ex.: Prefeito Municipal"
                      value={responsibleRole}
                      onChange={(e) => setResponsibleRole(e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                <label htmlFor="publication-type" className="block text-label-md font-label-md text-on-surface-variant mb-2">TIPO DE PUBLICAÇÃO</label>
                <select
                  id="publication-type"
                  value={publicationType}
                  onChange={(e) => { setPublicationType(e.target.value); setTouched((p) => ({ ...p, reference: true })); }}
                  disabled={!isEditable}
                  className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 appearance-none focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-sm text-on-surface"
                >
                  <option value="normal">Normal</option>
                  <option value="rectification">Retificação</option>
                  <option value="republication">Republicação</option>
                </select>

                {needsReference && (
                  <div className="mt-4 space-y-2">
                    <label htmlFor="ref-matter" className="block text-label-md font-label-md text-on-surface-variant">
                      PUBLICAÇÃO ORIGINAL <span className="text-error">*</span>
                    </label>
                    <input
                      id="ref-matter"
                      type="text"
                      value={refSearch}
                      onChange={(e) => setRefSearch(e.target.value)}
                      placeholder="Buscar por título, número ou ano…"
                      aria-describedby="ref-search-help"
                      className="w-full h-11 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 text-body-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      disabled={!isEditable}
                    />
                    <p id="ref-search-help" className="text-[10px] text-on-surface-variant">
                      Pesquise a matéria já publicada que será retificada/republicada.
                    </p>
                    {refSearching && <p className="text-xs text-on-surface-variant">Buscando…</p>}
                    <ul className="space-y-1 max-h-40 overflow-y-auto" role="listbox" aria-label="Publicações encontradas">
                      {refResults.map((rm) => (
                        <li key={rm.id} role="option" aria-selected={referencesMatterId === rm.id}>
                          <button
                            type="button"
                            onClick={() => { setReferencesMatterId(rm.id); setTouched((p) => ({ ...p, reference: true })); }}
                            className={clsx(
                              "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                              referencesMatterId === rm.id
                                ? "bg-primary-fixed text-on-primary-fixed-variant font-semibold"
                                : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"
                            )}
                          >
                            <span className="block truncate">{rm.title}</span>
                            <span className="text-[10px] text-on-surface-variant">
                              {new Date(rm.updated_at).toLocaleDateString("pt-BR")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {errors.reference && (
                      <p className="text-xs text-error flex items-center gap-1" role="alert">
                        <span className="material-symbols-outlined text-xs">warning</span> {errors.reference}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {matterId && (
                <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                  <AttachmentUpload matterId={matterId} attachments={attachments}
                    onAttachmentsChange={() => api.getMatter(matterId).then((m) => setAttachments(m.attachments))}
                    disabled={!isEditable} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: DOCUMENTO */}
        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-gutter items-start">
            <div className="space-y-gutter min-w-0">
              {/* Content mode selection */}
              <div className="bg-surface-bright rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
                <div className="p-4 bg-surface-container-high border-b border-outline-variant">
                  <span className="text-label-md font-label-md text-on-surface-variant">COMO DESEJA CRIAR O DOCUMENTO?</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4" role="radiogroup" aria-label="Tipo de documento">
                  <ModeCard
                    selected={contentMode === "rich_text"}
                    onSelect={() => setContentMode("rich_text")}
                    icon="edit_note"
                    iconCls="text-primary"
                    title="Documento editável"
                    selectedLabel="✓ Documento editável selecionado"
                    description="Digite, cole ou importe o texto. O conteúdo poderá ser estruturado e revisado pelo editor."
                    disabled={!isEditable}
                  />
                  <ModeCard
                    selected={contentMode === "pdf"}
                    onSelect={() => { if (hasContent && contentMode !== "pdf") { if (!window.confirm("Trocar para PDF pronto descartará o conteúdo editável atual. Continuar?")) return; } setContentMode("pdf"); }}
                    icon="picture_as_pdf"
                    iconCls="text-tertiary"
                    selectedLabel="✓ PDF pronto selecionado"
                    title="PDF pronto"
                    description="Envie um PDF finalizado mantendo integralmente sua paginação e aparência."
                    disabled={!isEditable}
                  />
                </div>
              </div>

              {/* PDF Upload Area */}
              {contentMode === "pdf" && (
              <div className="bg-surface-bright rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
                <div className="p-4 bg-surface-container-high border-b border-outline-variant flex items-center gap-2">
                  <span className="material-symbols-outlined text-tertiary">upload_file</span>
                  <span className="text-label-md font-label-md text-on-surface-variant">ANEXAR PDF COMO CONTEÚDO</span>
                </div>
                <div className="p-5 space-y-3">
                  {contentPdfName ? (
                    <div className="flex items-center justify-between bg-primary-container/20 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="material-symbols-outlined text-primary">picture_as_pdf</span>
                        <span className="text-body-sm font-medium text-on-surface truncate">{contentPdfName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setContentPdfName(null); }}
                        aria-label="Remover PDF enviado"
                        className="text-on-surface-variant hover:text-error p-1 rounded-full"
                        disabled={!isEditable}
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center border-2 border-dashed border-outline-variant rounded-xl p-6 cursor-pointer hover:bg-surface-container-low transition-colors ${!isEditable ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <span className="material-symbols-outlined text-3xl text-outline mb-2" aria-hidden="true">upload</span>
                      <span className="text-body-sm font-medium text-on-surface-variant">Clique para selecionar um PDF</span>
                      <span className="text-label-md text-outline mt-1">O PDF será convertido em imagens para o ato</span>
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        disabled={!isEditable || uploadingPdf}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingPdf(true);
                          try {
                            let currentId = matterId;
                            if (!currentId) {
                              const created = await api.createMatter({
                                ...metadataPayload(),
                                content_html: "<p></p>",
                              } as Parameters<typeof api.createMatter>[0]);
                              currentId = created.id;
                            }
                            await api.uploadContentPdf(currentId, file);
                            setContentPdfName(file.name);
                            const updated = await api.getMatter(currentId);
                            setContentHtml(fixImageUrls(updated.content_html));
                            setTouched((p) => ({ ...p, content: true }));
                            if (!matterId) {
                              router.replace(`/matters/${currentId}/edit?step=2`);
                              return;
                            }
                            toast.success("PDF convertido para o conteúdo da matéria");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Erro ao enviar PDF");
                          } finally {
                            setUploadingPdf(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                  )}
                  {uploadingPdf && (
                    <div className="flex items-center gap-2 text-body-sm text-primary">
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                      Convertendo PDF...
                    </div>
                  )}
                </div>
              </div>
              )}
              {contentMode === "pdf" && contentHtml && (
                <div className="bg-surface-bright rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
                  <div className="p-4 bg-surface-container-high border-b border-outline-variant flex items-center gap-2">
                    <span className="material-symbols-outlined text-tertiary">description</span>
                    <span className="text-label-md font-label-md text-on-surface-variant">PRÉ-VISUALIZAÇÃO DO PDF</span>
                  </div>
                  <MatterContentPreview
                    pdfMode
                    contentHtml={contentHtml}
                    className="bg-white rounded-b-xl overflow-x-auto"
                  />
                  <p className="px-4 py-3 text-xs text-on-surface-variant border-t border-outline-variant">
                    Modo <strong>PDF pronto</strong>: as páginas originais são preservadas. O texto não pode ser editado como no editor.
                  </p>
                </div>
              )}
              {contentMode === "rich_text" && (
              <div className="bg-surface-bright rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
                <div className="p-4 bg-surface-container-high border-b border-outline-variant flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSemanticMode((m) => !m)}
                    aria-pressed={semanticMode}
                    className="flex items-center gap-2 text-label-md font-label-md text-on-surface-variant hover:text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
                  >
                    <span className="material-symbols-outlined text-primary">edit_note</span>
                    {semanticMode ? "EDITOR SEMÂNTICO POR BLOCOS" : "EDITOR DE CONTEÚDO"}
                    <span className={`material-symbols-outlined text-[18px] ${semanticMode ? "text-secondary" : ""}`} aria-hidden="true">
                      {semanticMode ? "toggle_on" : "toggle_off"}
                    </span>
                  </button>
                  <span className="text-[10px] text-on-surface-variant ml-auto flex items-center gap-1">
                    <span
                      className={
                        clsx(
                          "inline-block w-2 h-2 rounded-full",
                          semanticMode && semanticStatus?.analyzed
                            ? semanticStatus.errors > 0 ? "bg-error" : semanticStatus.pendingBlocks > 0 ? "bg-amber-500" : "bg-secondary"
                            : "bg-outline-variant"
                        )
                      }
                      aria-hidden="true"
                    />
                    {semanticMode
                      ? semanticStatus?.analyzed
                        ? semanticStatus.errors > 0
                          ? "Análise com problemas"
                          : semanticStatus.pendingBlocks > 0
                            ? "Analisado — blocos a confirmar"
                            : "Estrutura analisada"
                        : "Análise pendente"
                      : "Análise pendente"}
                  </span>
                </div>
                {semanticMode ? (
                  matterId ? (
                    <div className="p-5">
                      <SemanticEditor
                        matterId={matterId}
                        title={title}
                        summary={summary}
                        documentType={selectedActType?.name || undefined}
                        onSaved={() => setHasSemantic(true)}
                        onStatusChange={setSemanticStatus}
                      />
                    </div>
                  ) : (
                    <div className="p-6 text-sm text-on-surface-variant flex items-start gap-2">
                      <span className="material-symbols-outlined text-primary">info</span>
                      <p>Para usar o editor semântico, salve a matéria primeiro (o documento precisa de um ID). Clique em <strong>Salvar Rascunho</strong> na barra inferior e o editor será liberado aqui.</p>
                    </div>
                  )
                ) : (
                  <></>
                )}
                <div className={semanticMode ? "hidden" : ""}>
                <Editor content={contentHtml}
                  contentJson={contentJson}
                  onChange={(html) => { setContentHtml(html); setTouched((p) => ({ ...p, content: true })); }}
                  onChangeJson={(json) => setContentJson(json)}
                  onCleanWarnings={setCleanWarnings}
                  aiContext={{ actType: selectedActType?.name, title, summary }} />
                {errors.content && <p className="text-xs text-error px-5 pb-3 flex items-center gap-1" role="alert"><span className="material-symbols-outlined text-xs">warning</span> {errors.content}</p>}
              </div>
              </div>
              )}
            </div>

            {/* Sidebar — resumo vivo */}
            <MatterSidePanel
              title={title}
              actTypeName={selectedActType?.name ?? null}
              actNumber={actNumber || null}
              actYear={actYear ? Number(actYear) : null}
              actDate={actDate}
              orgUnit={orgUnits.find((o) => o.id === orgUnitId) ?? null}
              status={status}
              documentMode={semanticMode ? "semantic" : contentMode}
              semantic={{ mode: semanticMode, hasDoc: hasSemantic, status: semanticStatus }}
              saveState={saveState}
              lastSavedAt={lastSavedAt}
              alertCount={cleanWarnings.length}
            >
              {matterId && (
                <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                  <AttachmentUpload matterId={matterId} attachments={attachments}
                    onAttachmentsChange={() => api.getMatter(matterId).then((m) => setAttachments(m.attachments))}
                    disabled={!isEditable} />
                </div>
              )}
              {matterId && (
                <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                  <StatusHistory matterId={matterId} />
                </div>
              )}
            </MatterSidePanel>
          </div>
        )}

        {/* Step 3: REVISÃO E PUBLICAÇÃO */}
        {step === 3 && (
          <div className="max-w-4xl mx-auto space-y-gutter">
            <div className="bg-surface-bright rounded-2xl p-8 border border-outline-variant shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-secondary">assignment_turned_in</span>
                <h3 className="text-headline-sm font-headline-sm text-primary">Revisão Final</h3>
              </div>

              {/* IDENTIFICAÇÃO */}
              <h4 className="text-label-md font-label-md text-on-surface-variant mb-3">IDENTIFICAÇÃO</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ReviewField label="TIPO DO ATO" value={selectedActType?.name ?? "-"} />
                <ReviewField label="NÚMERO / ANO" value={actNumber || actYear ? `${actNumber ? `Nº ${actNumber}` : ""}${actYear ? ` / ${actYear}` : ""}` : "-"} />
                <ReviewField label="DATA DO ATO" value={actDate ? new Date(`${actDate}T12:00:00`).toLocaleDateString("pt-BR") : "-"} />
                <ReviewField label="TÍTULO" value={title} strong />
              </div>
              <div className="mt-4">
                <ReviewField label="SÚMULA" value={summary || "-"} multiline />
              </div>

              {/* ORIGEM */}
              <h4 className="text-label-md font-label-md text-on-surface-variant mt-6 mb-3">ORIGEM</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ReviewField label="UNIDADE PUBLICADORA" value={(() => {
                  const ou = orgUnits.find((o) => o.id === orgUnitId);
                  return ou ? (ou.parent_name ? `${ou.parent_name} › ${ou.name}` : ou.name) : "-";
                })()} />
                <ReviewField label="RESPONSÁVEL PELO ATO" value={[responsibleName, responsibleRole].filter(Boolean).join(" — ") || "-"} />
                {needsReference && <ReviewField label="PUBLICAÇÃO ORIGINAL" value={refResults.find((r) => r.id === referencesMatterId)?.title ?? "Vinculada"} />}
              </div>

              {/* DOCUMENTO */}
              <h4 className="text-label-md font-label-md text-on-surface-variant mt-6 mb-3">DOCUMENTO</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <ReviewField label="TIPO" value={hasSemantic ? "Editável (semântico)" : contentMode === "pdf" ? "PDF pronto" : "Editável"} />
                <ReviewField label="STATUS" value={<StatusBadge status={status} size="sm" />} />
                <ReviewField
                  label="MOTOR SEMÂNTICO"
                  value={
                    semanticStatus?.analyzed
                      ? semanticStatus.errors > 0
                        ? `${semanticStatus.errors} ponto(s) com erro`
                        : semanticStatus.pendingBlocks > 0
                          ? `${semanticStatus.pendingBlocks} bloco(s) a confirmar`
                          : "Estrutura analisada"
                      : "Análise pendente"
                  }
                />
              </div>
              <div>
                <span className="text-label-md font-label-md text-on-surface-variant">CONTEÚDO</span>
                <div className="mt-1">
                  {hasSemantic ? (
                    <SemanticReview
                      matterId={matterId}
                      onLoadState={setReviewState}
                    />
                  ) : contentMode === "pdf" ? (
                    <MatterContentPreview
                      pdfMode
                      contentHtml={contentHtml}
                      className="bg-white rounded-xl border border-outline-variant overflow-x-auto"
                    />
                  ) : (
                    <MatterContentPreview
                      contentJson={contentJson}
                      contentHtml={contentHtml}
                      className="bg-white rounded-xl border border-outline-variant overflow-x-auto"
                    />
                  )}
                </div>
              </div>
              {attachments.length > 0 && (
                <div className="mt-4">
                  <span className="text-label-md font-label-md text-on-surface-variant">ANEXOS</span>
                  <ul className="mt-1 p-3 bg-surface-container-low rounded-xl space-y-1">
                    {attachments.map((a) => (
                      <li key={a.id} className="text-body-sm text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-secondary" aria-hidden="true">attach_file</span>
                        {a.title || a.type}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* PUBLICAÇÃO — destino explícito */}
            {matterId && (
              <PublishSection matterId={matterId} matterTitle={title} status={status} />
            )}

            {matterId && (
              <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                <StatusHistory matterId={matterId} />
              </div>
            )}
          </div>
        )}

        {/* Not editable message */}
        {!isEditable && matter && !isNew && (
          <div className="mt-6 bg-surface-container-high border border-outline-variant p-4 rounded-2xl flex items-start gap-3 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-secondary shrink-0 mt-0.5">lock</span>
            <span>Matéria <strong>{status === "approved" ? "aprovada" : status === "published" ? "publicada" : status}</strong> — conteúdo bloqueado para edição.</span>
          </div>
        )}

        {/* Bottom action bar */}
        {isEditable && (
          <div className="sticky bottom-0 -mx-gutter px-gutter py-4 bg-surface/80 backdrop-blur-lg border-t border-outline-variant z-20">
            <div className="max-w-container-max mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-on-surface-variant" aria-live="polite">
                {saveState === "saving" ? (
                  <>
                    <span className="material-symbols-outlined text-sm text-primary animate-spin">progress_activity</span>
                    Salvando…
                  </>
                ) : saveState === "saved" && lastSavedAt ? (
                  <>
                    <span className="material-symbols-outlined text-sm text-secondary">check_circle</span>
                    Salvo às {lastSavedAt.toLocaleTimeString("pt-BR")}
                  </>
                ) : saveState === "error" ? (
                  <>
                    <span className="material-symbols-outlined text-sm text-error">error</span>
                    Não foi possível salvar
                    <button type="button" onClick={retrySave} className="text-primary font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded ml-1">
                      Tentar novamente
                    </button>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {isNew ? "Rascunho salvo automaticamente neste navegador" : "Alterações não salvas"}
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {status === "review" && matterId ? (
                  <>
                    <button type="button" onClick={handleReject} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-error/30 text-on-error-container hover:bg-error-container/30 disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">thumb_down</span>}
                      Rejeitar
                    </button>
                    <button type="button" onClick={handleApprove}
                      disabled={saving || !hasContent || (hasSemantic && (!reviewState.loaded || !reviewState.confirmed || !reviewState.valid))}
                      title={!hasContent ? "Não é possível aprovar sem conteúdo" : hasSemantic && !reviewState.loaded ? "Aguardando carregamento da revisão" : hasSemantic && !reviewState.confirmed ? "Confirme todos os blocos antes de aprovar" : undefined}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">thumb_up</span>}
                      Aprovar
                    </button>
                  </>
                ) : step === 1 ? (
                  <>
                    <button type="button" onClick={() => router.push("/matters")}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low">
                      Voltar para Matérias
                    </button>
                    <button type="button" onClick={handleSaveAndExit} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
                      Salvar e sair
                    </button>
                    <button type="button" onClick={() => { if (validateStep(1)) setStep(2); }}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-primary text-on-primary hover:bg-primary-container">
                      Avançar para Documento
                      <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                    </button>
                  </>
                ) : step === 2 ? (
                  <>
                    <button type="button" onClick={() => setStep(1)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low">
                      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
                      Voltar
                    </button>
                    <button type="button" onClick={handleSaveAndExit} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
                      Salvar e sair
                    </button>
                    <button type="button" onClick={() => { if (validateStep(2)) setStep(3); }}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-primary text-on-primary hover:bg-primary-container">
                      Avançar para Revisão
                      <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setStep(2)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low">
                      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
                      Voltar
                    </button>
                    <button type="button" onClick={() => save("draft")} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
                      Salvar Rascunho
                    </button>
                    <button type="button" onClick={() => save("review")} disabled={saving || !isValid}
                      title="Envia a matéria para aprovação do revisor"
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-primary text-on-primary hover:bg-primary-container disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">send</span>}
                      Enviar para Aprovação
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="h-10" />
      </div>
    </div>
  );
}

type MatterSidePanelProps = React.ComponentProps<typeof MatterSidePanel>;

/** Local wrapper so the form does not import config plumbing everywhere. */
/** Local wrapper for per-type configurable title suggestion. */
function suggestTitleLocal(actType: ActType, number: string | null, year: number | null): string {
  return suggestTitle(actType.name, number || null, year ?? null, actType.config);
}

function legacyHintAvailable(matter?: Matter | null) {
  if (!matter) return null;
  if (matter.act_number && matter.act_year) return null;
  const parsed = parseTitleMetadata(matter.title);
  if (!parsed.number || !parsed.year) return null;
  return parsed;
}

function ReviewField({ label, value, strong, multiline }: { label: string; value: React.ReactNode; strong?: boolean; multiline?: boolean }) {
  return (
    <div>
      <span className="text-label-md font-label-md text-on-surface-variant">{label}</span>
      <p className={clsx(
        "text-body-md mt-1 p-3 bg-surface-container-low rounded-xl break-words",
        strong ? "font-semibold text-primary" : "text-on-surface"
      )}>
        {value}
      </p>
      {multiline && <span className="sr-only">{typeof value === "string" ? value : ""}</span>}
    </div>
  );
}

function ModeCard({
  selected, onSelect, icon, iconCls, title, description, selectedLabel, disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: string;
  iconCls: string;
  title: string;
  description: string;
  selectedLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selected ? "border-primary bg-primary-fixed/20 shadow-sm" : "border-outline-variant hover:border-primary"}`}
    >
      <span className="flex items-center gap-2">
        <span className={`material-symbols-outlined text-[22px] ${iconCls}`} aria-hidden="true">{icon}</span>
        <span className="text-body-sm font-semibold text-on-surface">{title}</span>
        {selected && <span className="material-symbols-outlined text-secondary text-[18px]" aria-hidden="true">check_circle</span>}
      </span>
      <span className={clsx("text-xs leading-snug", selected ? "text-primary font-medium" : "text-on-surface-variant")}>
        {selected && selectedLabel ? selectedLabel : description}
      </span>
      {selected && selectedLabel && (
        <span className="text-xs text-on-surface-variant leading-snug">{description}</span>
      )}
    </button>
  );
}
