"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import clsx from "clsx";

import Editor from "@/components/Editor";
import AttachmentUpload from "./AttachmentUpload";
import StatusHistory from "./StatusHistory";
import StatusBadge from "./StatusBadge";
import Breadcrumbs from "@/components/Breadcrumbs";
import { sanitizeHtml } from "@/lib/sanitize";
import { api } from "@/lib/api";
import type { ActType, Attachment, Matter, MatterStatus, OrgUnit } from "@/types/matter";

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

const ACT_TYPE_MATERIAL_ICONS: Record<string, string> = {
  "Ata": "contract",
  "Contrato": "handshake",
  "Decreto": "policy",
  "Edital": "campaign",
  "Lei": "gavel",
  "Licitação": "shopping_basket",
  "Portaria": "description",
  "Relatório": "analytics",
};

function getActTypeMaterialIcon(name: string): string {
  return ACT_TYPE_MATERIAL_ICONS[name] || "more_horiz";
}

export default function MatterForm({ matter, isNew, initialStep }: MatterFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep || 1);
  const [title, setTitle] = useState(matter?.title ?? "");
  const [summary, setSummary] = useState(matter?.summary ?? "");
  const [actTypeId, setActTypeId] = useState(matter?.act_type_id ?? "");
  const [orgUnitId, setOrgUnitId] = useState(matter?.org_unit_id ?? "");
  const [contentHtml, setContentHtml] = useState(matter?.content_html ? fixImageUrls(matter.content_html) : "");
  const [status, setStatus] = useState<MatterStatus>(matter?.status ?? "draft");
  const [attachments, setAttachments] = useState<Attachment[]>(matter?.attachments ?? []);
  const [actTypes, setActTypes] = useState<ActType[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [contentPdfName, setContentPdfName] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [cleanWarnings, setCleanWarnings] = useState<string[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const draftLoaded = useRef(false);
  const titleAutoFilled = useRef(false);

  const isEditable = status === "draft" || status === "review" || status === "rejected";
  const selectedActType = actTypes.find((a) => a.id === actTypeId);

  useEffect(() => {
    api.listActTypes().then(setActTypes).catch(() => {});
    api.listOrgUnits().then(setOrgUnits).catch(() => {});
  }, []);

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
            setOrgUnitId(data.org_unit_id ?? "");
            setContentHtml(data.content_html ?? "");
            toast.success("Rascunho local restaurado");
          }
        }
      } catch { /* ignore */ }
    }
  }, [matter]);

  useEffect(() => {
    if (isNew && isEditable) {
      const timer = setTimeout(() => {
        localStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({ title, summary, act_type_id: actTypeId, org_unit_id: orgUnitId, content_html: contentHtml })
        );
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isNew, isEditable, title, summary, actTypeId, orgUnitId, contentHtml]);

  const errors: Record<string, string> = {};
  if (touched.title && !title.trim()) errors.title = "O título é obrigatório";
  if (touched.actType && !actTypeId) errors.actType = "Selecione o tipo de ato";
  const hasContent = contentHtml && contentHtml !== "<p></p>";
  if (touched.content && !hasContent) errors.content = "O conteúdo é obrigatório";

  const isValid = !errors.title && !errors.actType && !errors.content;

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      if (!title.trim()) { toast.error("Digite o título da matéria"); return false; }
      if (!actTypeId) { toast.error("Selecione o tipo de ato"); return false; }
      return true;
    }
    if (s === 2) {
      if (!hasContent) { toast.error("Escreva o conteúdo da matéria"); return false; }
      return true;
    }
    return true;
  };

  const save = useCallback(
    async (action: "draft" | "review") => {
      setTouched({ title: true, actType: true, content: true });

      if (!title.trim()) { toast.error("Digite o título da matéria"); return; }
      if (!actTypeId) { toast.error("Selecione o tipo de ato"); return; }
      if (!hasContent) { toast.error("Escreva o conteúdo da matéria"); return; }

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
      try {
        const payload = {
          title: title.trim(),
          summary: summary.trim() || undefined,
          act_type_id: actTypeId,
          org_unit_id: orgUnitId || undefined,
          content_html: clean,
        };

        let result: Matter;
        if (isNew) {
          result = await api.createMatter(payload);
        } else if (matter) {
          result = await api.updateMatter(matter.id, payload);
        } else {
          return;
        }

        if (action === "review") {
          result = await api.submitReview(result.id);
        }

        setStatus(result.status);
        setLastSaved(new Date());
        localStorage.removeItem(AUTOSAVE_KEY);
        toast.success(action === "review" ? "Matéria enviada para revisão!" : "Rascunho salvo com sucesso");

        if (isNew) {
          router.push(`/matters/${result.id}/edit`);
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      } finally {
        setSaving(false);
      }
    },
    [title, summary, actTypeId, orgUnitId, contentHtml, isNew, matter, router, hasContent]
  );

  const matterId = matter?.id;

  const handleActTypeSelect = async (actType: ActType) => {
    setActTypeId(actType.id);
    setTouched((p) => ({ ...p, actType: true }));

    if (!isNew || !isEditable) return;

    const year = new Date().getFullYear();
    const fallbackTitle = `${actType.name.toUpperCase()} – 01/${year}`;
    setTitle(fallbackTitle);
    setGeneratingTitle(true);

    try {
      const next = await api.getNextMatterTitle(actType.id);
      const nextTitle = next.title.includes("/")
        ? next.title
        : `${next.title}/${year}`;
      setTitle(nextTitle);
      titleAutoFilled.current = true;
      toast.success(`Título gerado: ${nextTitle}`);
    } catch {
      titleAutoFilled.current = true;
      toast.success(`Título definido: ${fallbackTitle}`);
    } finally {
      setGeneratingTitle(false);
    }
  };

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

  return (
    <div className="overflow-y-auto custom-scrollbar" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="p-gutter">
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
                ? "Preencha os dados para criar uma nova matéria administrativa."
                : `Versão ${matter?.version} · ${new Date(matter!.created_at).toLocaleDateString("pt-BR")}`}
            </p>
          </div>
          {!isNew && matter && (
            <div className="ml-auto flex items-center gap-2">
              <StatusBadge status={status} size="sm" />
              {lastSaved && (
                <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm text-secondary">check_circle</span>
                  {lastSaved.toLocaleTimeString("pt-BR")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stepper */}
        <div className="max-w-4xl mx-auto mb-stack-lg bg-surface-bright rounded-2xl p-6 shadow-sm border border-outline-variant">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: "INFORMAÇÕES" },
              { num: 2, label: "CONTEÚDO" },
              { num: 3, label: "REVISÃO" },
            ].map((s, idx) => (
              <button
                key={s.num}
                type="button"
                onClick={() => {
                  if (s.num < step) setStep(s.num);
                  if (s.num > step && validateStep(step)) setStep(s.num);
                }}
                disabled={!isEditable}
                className="flex flex-col items-center gap-2 flex-1 relative group"
              >
                <div className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold z-10 transition-all",
                  s.num === step
                    ? "bg-primary text-on-primary"
                    : s.num < step
                      ? "bg-secondary text-on-secondary"
                      : "bg-surface-container-high text-on-surface-variant border border-outline-variant"
                )}>
                  {s.num < step ? (
                    <span className="material-symbols-outlined text-sm">check</span>
                  ) : (
                    s.num
                  )}
                </div>
                <span className={clsx(
                  "text-label-md font-label-md",
                  s.num === step ? "text-primary" : "text-on-surface-variant"
                )}>
                  {s.label}
                </span>
                {idx < 2 && (
                  <div className={clsx(
                    "absolute top-5 left-1/2 w-full h-[2px] transition-colors",
                    s.num < step ? "bg-secondary" : "bg-outline-variant"
                  )} />
                )}
              </button>
            ))}
          </div>
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

        {/* Step 1: Informações */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter items-start">
            <div className="lg:col-span-2 space-y-gutter">
              <div className="bg-surface-bright rounded-2xl p-8 border border-outline-variant shadow-sm">
                <div className="mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">info</span>
                  <h3 className="text-headline-sm font-headline-sm text-primary">Dados Principais</h3>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-label-md font-label-md text-on-surface-variant mb-2" htmlFor="matter-title">
                      TÍTULO DA MATÉRIA <span className="text-error">*</span>
                    </label>
                    <input id="matter-title"
                      className={clsx("w-full h-14 bg-surface-container-lowest border rounded-xl px-4 focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none text-body-md", errors.title ? "border-error bg-error-container/20" : "border-outline-variant")}
                      placeholder="Ex: PORTARIA – 01" type="text" value={title}
                      onChange={(e) => { titleAutoFilled.current = false; setTitle(e.target.value); setTouched((p) => ({ ...p, title: true })); }}
                      disabled={!isEditable} maxLength={200} />
                    <div className="flex justify-between mt-1">
                      {errors.title && <p className="text-xs text-error flex items-center gap-1"><span className="material-symbols-outlined text-xs">warning</span> {errors.title}</p>}
                      <p className="text-[10px] text-on-surface-variant ml-auto">{title.length}/200</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-md font-label-md text-on-surface-variant mb-2" htmlFor="matter-summary">SÚMULA <span className="text-error">*</span></label>
                    <textarea id="matter-summary"
                      className="w-full h-32 bg-surface-container-lowest border border-outline-variant rounded-xl p-4 focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none text-body-md resize-none"
                      placeholder="Breve descrição do conteúdo..." value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      disabled={!isEditable} maxLength={500} />
                    <p className="text-right text-[10px] text-on-surface-variant mt-1">{summary.length}/500</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-gutter">
              <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                <label className="block text-label-md font-label-md text-on-surface-variant mb-4">TIPO DE ATO <span className="text-error">*</span></label>
                <div className="grid grid-cols-3 gap-3">
                  {actTypes.map((at) => {
                    const isSelected = at.id === actTypeId;
                    return (
                      <button key={at.id} type="button" disabled={!isEditable} onClick={() => handleActTypeSelect(at)}
                        className={clsx("flex flex-col items-center justify-center p-3 rounded-xl border transition-all", isSelected ? "bg-primary text-on-primary border-primary shadow-md" : "border-outline-variant hover:border-primary hover:bg-primary-fixed group")}>
                        <span className={clsx("material-symbols-outlined mb-2", isSelected ? "" : "text-on-surface-variant group-hover:text-primary")}>{getActTypeMaterialIcon(at.name)}</span>
                        <span className={clsx("text-[10px] font-bold", isSelected ? "" : "text-on-surface-variant group-hover:text-primary")}>{at.name}</span>
                      </button>
                    );
                  })}
                </div>
                {errors.actType && <p className="text-xs text-error mt-2 flex items-center gap-1"><span className="material-symbols-outlined text-xs">warning</span> {errors.actType}</p>}
                {generatingTitle && <p className="text-xs text-primary mt-2 flex items-center gap-1"><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Gerando próxima numeração...</p>}
              </div>
              <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                <label className="block text-label-md font-label-md text-on-surface-variant mb-4" htmlFor="matter-org-unit">UNIDADE PUBLICADORA <span className="text-error">*</span></label>
                <div className="relative">
                  <select id="matter-org-unit" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} disabled={!isEditable}
                    className="w-full h-12 bg-surface-container-lowest border border-outline-variant rounded-xl px-4 appearance-none focus:ring-2 focus:ring-primary focus:border-primary outline-none text-body-sm text-on-surface">
                    <option value="">Selecione a unidade...</option>
                    {orgUnits.map((ou) => <option key={ou.id} value={ou.id}>{ou.abbreviation || ou.name}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">expand_more</span>
                </div>
              </div>
              {matterId && (
                <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                  <AttachmentUpload matterId={matterId} attachments={attachments}
                    onAttachmentsChange={() => api.getMatter(matterId).then((m) => setAttachments(m.attachments))}
                    disabled={!isEditable} />
                </div>
              )}
              <div className="bg-surface-container-high border border-outline-variant p-4 rounded-2xl flex gap-3">
                <span className="material-symbols-outlined text-primary-container">lightbulb</span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  <strong className="text-primary block mb-1">Dica de Redação:</strong>
                  Mantenha o título conciso para facilitar a indexação e busca por outros usuários e cidadãos no portal público.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Conteúdo */}
        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter items-start">
            <div className="lg:col-span-2 space-y-gutter">
              {/* PDF Upload Area */}
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
                        className="text-on-surface-variant hover:text-error p-1 rounded-full"
                        disabled={!isEditable}
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>
                  ) : (
                    <label className={`flex flex-col items-center justify-center border-2 border-dashed border-outline-variant rounded-xl p-6 cursor-pointer hover:bg-surface-container-low transition-colors ${!isEditable ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <span className="material-symbols-outlined text-3xl text-outline mb-2">upload</span>
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
                                title: title.trim() || "Sem título",
                                summary: summary.trim() || undefined,
                                act_type_id: actTypeId,
                                org_unit_id: orgUnitId || undefined,
                                content_html: "<p></p>",
                              });
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
              <div className="bg-surface-bright rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
                <div className="p-4 bg-surface-container-high border-b border-outline-variant flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">edit_note</span>
                  <span className="text-label-md font-label-md text-on-surface-variant">EDITOR DE CONTEÚDO <span className="text-error">*</span></span>
                </div>
                <Editor content={contentHtml}
                  onChange={(html) => { setContentHtml(html); setTouched((p) => ({ ...p, content: true })); }}
                  onCleanWarnings={setCleanWarnings}
                  aiContext={{ actType: selectedActType?.name, title, summary }} />
                {errors.content && <p className="text-xs text-error px-5 pb-3 flex items-center gap-1"><span className="material-symbols-outlined text-xs">warning</span> {errors.content}</p>}
              </div>
              <div className="bg-surface-bright rounded-2xl p-6 border border-outline-variant shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-secondary">description</span>
                  <h4 className="text-label-md font-label-md text-on-surface-variant">RESUMO DA MATÉRIA</h4>
                </div>
                <div className="p-4 bg-surface-container-low rounded-xl">
                  <p className="text-body-sm font-semibold text-primary">{title || "Sem título"}</p>
                  {summary && <p className="text-body-sm text-on-surface-variant mt-1">{summary}</p>}
                  <div className="flex gap-2 mt-2">
                    {actTypeId && <span className="text-[10px] bg-primary-fixed/30 px-2 py-0.5 rounded font-medium">{actTypes.find(a => a.id === actTypeId)?.name || ""}</span>}
                    {orgUnitId && <span className="text-[10px] bg-secondary-container/30 px-2 py-0.5 rounded font-medium">{orgUnits.find(o => o.id === orgUnitId)?.abbreviation || orgUnits.find(o => o.id === orgUnitId)?.name || ""}</span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-gutter">
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
              <div className="bg-surface-container-high border border-outline-variant p-4 rounded-2xl flex gap-3">
                <span className="material-symbols-outlined text-tertiary">info</span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  <strong className="text-primary block mb-1">Dica de Edição:</strong>
                  Utilize as ferramentas de formatação para estruturar o conteúdo oficial com títulos, listas e tabelas.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Revisão */}
        {step === 3 && (
          <div className="max-w-4xl mx-auto space-y-gutter">
            <div className="bg-surface-bright rounded-2xl p-8 border border-outline-variant shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-secondary">assignment_turned_in</span>
                <h3 className="text-headline-sm font-headline-sm text-primary">Revisão Final</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <span className="text-label-md font-label-md text-on-surface-variant">TÍTULO</span>
                  <p className="text-body-md font-semibold text-primary mt-1 p-3 bg-surface-container-low rounded-xl">{title}</p>
                </div>
                <div>
                  <span className="text-label-md font-label-md text-on-surface-variant">TIPO DE ATO</span>
                  <p className="text-body-md font-semibold text-primary mt-1 p-3 bg-surface-container-low rounded-xl">{actTypes.find(a => a.id === actTypeId)?.name || "-"}</p>
                </div>
                <div>
                  <span className="text-label-md font-label-md text-on-surface-variant">UNIDADE PUBLICADORA</span>
                  <p className="text-body-md font-semibold text-primary mt-1 p-3 bg-surface-container-low rounded-xl">{orgUnits.find(o => o.id === orgUnitId)?.name || "-"}</p>
                </div>
                <div>
                  <span className="text-label-md font-label-md text-on-surface-variant">STATUS</span>
                  <div className="mt-1 p-3 bg-surface-container-low rounded-xl">
                    <span className="px-3 py-1 bg-surface-container-highest text-on-surface-variant text-[11px] font-bold rounded-full uppercase tracking-wider">Rascunho</span>
                  </div>
                </div>
              </div>
              {summary && (
                <div className="mt-4">
                  <span className="text-label-md font-label-md text-on-surface-variant">SÚMULA</span>
                  <p className="text-body-md text-on-surface-variant mt-1 p-3 bg-surface-container-low rounded-xl">{summary}</p>
                </div>
              )}
            </div>
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
          <div className="sticky bottom-0 mt-8 -mx-gutter px-gutter py-4 bg-surface/80 backdrop-blur-lg border-t border-outline-variant">
            <div className="max-w-container-max mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                {lastSaved ? (
                  <>
                    <span className="material-symbols-outlined text-sm text-secondary">check_circle</span>
                    Salvo às {lastSaved.toLocaleTimeString("pt-BR")}
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {isNew ? "Rascunho salvo automaticamente" : "Modificações não salvas"}
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                {status === "review" && matterId ? (
                  <>
                    <button type="button" onClick={handleReject} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-error/30 text-on-error-container hover:bg-error-container/30 disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">thumb_down</span>}
                      Rejeitar
                    </button>
                    <button type="button" onClick={handleApprove} disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">thumb_up</span>}
                      Aprovar
                    </button>
                  </>
                ) : step === 1 ? (
                  <>
                    <button type="button" onClick={() => router.push("/matters")}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => { if (validateStep(1)) setStep(2); }}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-primary text-on-primary hover:bg-primary-container">
                      Avançar para Conteúdo
                      <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                  </>
                ) : step === 2 ? (
                  <>
                    <button type="button" onClick={() => setStep(1)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low">
                      <span className="material-symbols-outlined">arrow_back</span>
                      Voltar
                    </button>
                    <button type="button" onClick={() => { if (validateStep(2)) setStep(3); }}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-primary text-on-primary hover:bg-primary-container">
                      Avançar para Revisão
                      <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setStep(2)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low">
                      <span className="material-symbols-outlined">arrow_back</span>
                      Voltar
                    </button>
                    <button type="button" onClick={() => save("draft")} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border-2 border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
                      Salvar Rascunho
                    </button>
                    <button type="button" onClick={() => save("review")} disabled={saving || !isValid}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg bg-primary text-on-primary hover:bg-primary-container disabled:opacity-50">
                      {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">send</span>}
                      Publicar
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
