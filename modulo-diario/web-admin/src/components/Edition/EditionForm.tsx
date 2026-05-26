"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Edition, EditionType, EditionItem, MatterListItem } from "@/types/edition";
import StatusBadge from "@/components/Matter/StatusBadge";
import EditionPreview from "./EditionPreview";

interface EditionFormProps {
  edition?: Edition;
  isNew?: boolean;
}

const TYPE_OPTIONS: { value: EditionType; label: string; desc: string; icon: string }[] = [
  { value: "normal", label: "Normal", desc: "Regular diária", icon: "description" },
  { value: "extra", label: "Extra", desc: "Extraordinária", icon: "bolt" },
  { value: "suplementar", label: "Suplementar", desc: "Conteúdo extra", icon: "add_notes" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", closed: "Fechada", pdf_generated: "PDF Gerado",
  signed: "Assinada", published: "Publicada", cancelled: "Cancelada",
  scheduled: "Agendada",
};

export default function EditionForm({ edition, isNew }: EditionFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(isNew ? 1 : 1);
  const [number, setNumber] = useState(edition?.number ?? 1);
  const [year, setYear] = useState(edition?.year ?? new Date().getFullYear());
  const [type, setType] = useState<EditionType>(edition?.type ?? "normal");
  const autoTitle = `Diário Oficial - Edição ${String(number).padStart(2, "0")}`;
  const [title, setTitle] = useState(edition?.title ?? autoTitle);
  const [subtitle, setSubtitle] = useState(edition?.subtitle ?? "");
  const [pubDate, setPubDate] = useState(edition?.publication_date ?? new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState(edition?.status ?? "draft");
  const [items, setItems] = useState<EditionItem[]>(edition?.items ?? []);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editionId, setEditionId] = useState(edition?.id ?? "");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [credentials, setCredentials] = useState<any[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [pfxFile, setPfxFile] = useState<File | null>(null);
  const [pfxPassword, setPfxPassword] = useState("");
  const [showSignModal, setShowSignModal] = useState(false);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [signing, setSigning] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [availableMatters, setAvailableMatters] = useState<MatterListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loadingMatters, setLoadingMatters] = useState(false);
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const canAddItems = status === "draft" || status === "reviewing" || status === "scheduled";
  const isClosed = status === "closed";
  const isPdfGenerated = status === "pdf_generated";
  const isSigned = status === "signed";
  const isPublished = status === "published";
  const hasItems = editionId || edition?.id;
  const canReopenForEditing = isClosed || isPdfGenerated;
  const usedMatterIds = new Set(items.map((i) => i.matter_id));

  useEffect(() => {
    if (edition) {
      setEditionId(edition.id);
      setItems(edition.items);
      setStatus(edition.status);
    } else if (isNew) {
      api.listEditions({ year: new Date().getFullYear() })
        .then((existing) => {
          const maxNum = existing.reduce((max, e) => Math.max(max, e.number), 0);
          const nextNum = maxNum + 1;
          setNumber(nextNum);
          setTitle(`Diário Oficial - Edição ${String(nextNum).padStart(2, "0")}`);
        })
        .catch(() => {});
    }
  }, [edition]);

  const errors: Record<string, string> = {};
  if (touched.pubDate && !pubDate) errors.pubDate = "Selecione a data de publicação";
  if (touched.number && !number) errors.number = "Informe o número da edição";

  const fetchItems = async () => {
    if (!editionId && !edition?.id) return;
    const e = await api.getEdition(editionId || edition!.id);
    setItems(e.items);
    setStatus(e.status);
  };

  useEffect(() => {
    if (!hasItems) return;
    fetchItems();
  }, [editionId]);

  useEffect(() => {
    if (!hasItems) return;
    setLoadingMatters(true);
    const t = setTimeout(() => {
      api.listMatters({ status: "approved", search: search || undefined })
        .then(setAvailableMatters)
        .catch(() => {})
        .finally(() => setLoadingMatters(false));
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, hasItems]);

  useEffect(() => {
    if (hasItems) {
      api.listSigningCredentials?.()
        .then(setCredentials)
        .catch(() => {});
    }
  }, [hasItems]);

  const save = async () => {
    setTouched({ pubDate: true, number: true });
    setSaving(true);
    try {
      if (isNew && !editionId) {
        const e = await api.createEdition({ number, year, type, title, subtitle: subtitle || undefined, publication_date: pubDate });
        setEditionId(e.id);
        setStatus(e.status);
        toast.success("Edição criada com sucesso!");
        return e;
      } else if (editionId) {
        const e = await api.updateEdition(editionId, { title, subtitle: subtitle || undefined, publication_date: pubDate });
        setStatus(e.status);
        toast.success("Edição atualizada");
        return e;
      } else if (edition) {
        const e = await api.updateEdition(edition.id, { title, subtitle: subtitle || undefined, publication_date: pubDate });
        setStatus(e.status);
        toast.success("Edição atualizada");
        return e;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const closeEdition = async () => {
    const id = editionId || edition?.id;
    if (!id) return;
    try {
      const e = await api.closeEdition(id);
      setStatus(e.status);
      toast.success("Edição fechada");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao fechar");
    }
  };

  const reopenEdition = async () => {
    const id = editionId || edition?.id;
    if (!id) return;
    try {
      const e = await api.reopenEdition(id);
      setStatus(e.status);
      setStep(2);
      await fetchItems();
      toast.success("Edição reaberta");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao reabrir");
    }
  };

  const handleGeneratePdf = async () => {
    const id = editionId || edition?.id;
    if (!id) return;
    setGeneratingPdf(true);
    try {
      const e = await api.generatePdf(id);
      setStatus(e.status);
      toast.success("PDF gerado com sucesso!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleSign = async () => {
    const id = editionId || edition?.id;
    if (!id) return;
    setSigning(true);
    try {
      let body: any = { reason: "Assinatura Digital - DOE ICP-Brasil AD-RB" };
      if (selectedCredentialId) {
        body.signing_credential_id = selectedCredentialId;
        body.pfx_password = pfxPassword;
      } else if (pfxFile) {
        const pfxBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => { const r = reader.result as string; resolve(r.split(",")[1]); };
          reader.onerror = reject;
          reader.readAsDataURL(pfxFile);
        });
        body.pfx_base64 = pfxBase64;
        body.pfx_password = pfxPassword;
      } else {
        toast.error("Selecione um certificado ou faça upload do PFX");
        setSigning(false);
        return;
      }
      if (!pfxPassword) {
        toast.error("Informe a senha do certificado");
        setSigning(false);
        return;
      }
      await api.signEdition(id, body);
      setStatus("signed");
      toast.success("Edição assinada com sucesso!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao assinar");
    } finally {
      setSigning(false);
    }
  };

  const signPayload = async () => {
    if (!pfxPassword) throw new Error("Informe a senha do certificado");
    if (selectedCredentialId) {
      return {
        signing_credential_id: selectedCredentialId,
        pfx_password: pfxPassword,
        reason: "Assinatura Digital - DOE ICP-Brasil AD-RB",
      };
    }
    if (!pfxFile) throw new Error("Selecione um certificado ou faça upload do PFX");
    const pfxBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result as string;
        resolve(r.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(pfxFile);
    });
    return {
      pfx_base64: pfxBase64,
      pfx_password: pfxPassword,
      reason: "Assinatura Digital - DOE ICP-Brasil AD-RB",
    };
  };

  const handleCloseSignPublish = async () => {
    const id = editionId || edition?.id;
    if (!id) return;
    setWorkflowRunning(true);
    setWorkflowMessage("Preparando assinatura digital...");
    let signedSuccessfully = false;
    try {
      const payload = await signPayload();

      let currentStatus = status;
      if (currentStatus === "draft" || currentStatus === "reviewing" || currentStatus === "scheduled") {
        setWorkflowMessage("Fechando edição e gerando PDF...");
        const closed = await api.closeEdition(id);
        currentStatus = closed.status;
        setStatus(closed.status);
      }

      if (currentStatus === "closed") {
        setWorkflowMessage("Gerando PDF da edição...");
        const generated = await api.generatePdf(id);
        currentStatus = generated.status || "pdf_generated";
        setStatus(currentStatus);
      }

      setWorkflowMessage("Assinando PDF com certificado digital...");
      await api.signEdition(id, payload);
      currentStatus = "signed";
      setStatus("signed");
      signedSuccessfully = true;

      setWorkflowMessage("Publicando no portal público...");
      const published = await api.publishEdition(id);
      setStatus(published.status);
      setShowSignModal(false);
      setPfxPassword("");
      toast.success("Edição assinada e publicada com sucesso!");
      router.push("/editions");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao assinar e publicar";
      toast.error(message);
      if (!signedSuccessfully) {
        try {
          setWorkflowMessage("Assinatura recusada. Reabrindo edição...");
          const reopened = await api.reopenEdition(id);
          setStatus(reopened.status);
          setStep(2);
          toast("Edição reaberta para edição. Verifique a senha do certificado.");
        } catch {
          setStep(3);
        }
      } else {
        setStep(3);
      }
    } finally {
      setWorkflowRunning(false);
      setWorkflowMessage("");
    }
  };

  const handlePublish = async () => {
    const id = editionId || edition?.id;
    if (!id) return;
    setPublishing(true);
    try {
      const e = await api.publishEdition(id);
      setStatus(e.status);
      toast.success("Edição publicada!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao publicar");
    } finally {
      setPublishing(false);
    }
  };

  const addMatter = async (matterId: string) => {
    const id = editionId || edition?.id;
    if (!id) return;
    try {
      await api.addEditionItem(id, matterId);
      fetchItems();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao adicionar");
    }
  };

  const removeItem = async (itemId: string) => {
    const id = editionId || edition?.id;
    if (!id) return;
    try {
      await api.removeEditionItem(id, itemId);
      fetchItems();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  const handleDrop = async (toIdx: number) => {
    if (dragItemId === null) return;
    const sorted = [...items];
    const fromIdx = sorted.findIndex((i) => i.id === dragItemId);
    if (fromIdx === -1) return;
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.splice(toIdx, 0, moved);
    const id = editionId || edition?.id;
    if (!id) return;
    try {
      await api.reorderEditionItems(id, sorted.map((item, idx) => ({ id: item.id, position: idx })));
      fetchItems();
    } catch { /* keep UI */ }
    setDragItemId(null);
  };

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      if (!pubDate) { toast.error("Selecione a data de publicação"); return false; }
      if (!number) { toast.error("Informe o número da edição"); return false; }
      return true;
    }
    if (s === 2) {
      if (items.length === 0) { toast.error("Adicione pelo menos uma matéria à edição"); return false; }
      return true;
    }
    return true;
  };

  const currentEdition: Edition = {
    id: editionId || edition?.id || "", number, year, type, title, subtitle: subtitle || null,
    publication_date: pubDate, status, created_by: edition?.created_by || "",
    published_at: null, created_at: edition?.created_at || "", updated_at: "",
    items, item_count: items.length,
  };

  const Stepper = ({ current }: { current: number }) => (
    <div className="mb-12 relative">
      <div className="flex justify-between items-center max-w-3xl mx-auto">
        {[
          { num: 1, label: "Informações", desc: "Dados da edição" },
          { num: 2, label: "Matérias", desc: "Vincular conteúdo" },
          { num: 3, label: "Fechar", desc: "Revisão e envio" },
        ].map((s, idx) => {
          const isActive = s.num === current;
          const isDone = s.num < current;
          return (
            <div key={s.num} className="flex flex-col items-center gap-3 relative z-10">
              <button
                type="button"
                onClick={() => {
                  if (isDone) { setStep(s.num); return; }
                  if (s.num > current && validateStep(current)) {
                    if (s.num === 2 && isNew && !editionId) {
                      save().then(() => setStep(2));
                    } else {
                      setStep(s.num);
                    }
                  }
                }}
                className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all",
                  isActive ? "bg-secondary text-on-secondary ring-4 ring-secondary-container" :
                  isDone ? "bg-secondary text-on-secondary" :
                  "bg-surface-container-highest text-on-surface-variant"
                )}
              >
                {isDone ? <span className="material-symbols-outlined text-sm">check</span> : s.num}
              </button>
              <div className="text-center">
                <p className={clsx("font-bold text-sm", isActive || isDone ? "text-primary" : "text-on-surface-variant")}>{s.label}</p>
                <p className="text-[11px] text-on-surface-variant">{s.desc}</p>
              </div>
              {idx < 2 && (
                <div className="absolute top-5 left-[60%] w-[80%] h-1 bg-outline-variant rounded-full">
                  <div className={clsx("h-full bg-secondary rounded-full transition-all", isDone ? "w-full" : "w-0")} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">
      <div className="flex items-start justify-between mb-8">
        <div className="flex gap-4 items-center">
          <div className="p-3 bg-secondary-container text-on-secondary-container rounded-xl shadow-sm">
            <span className="material-symbols-outlined text-3xl">auto_stories</span>
          </div>
          <div>
            <h2 className="text-headline-lg font-headline-lg text-primary">
              {isNew ? "Nova Edição" : `Editar Edição ${edition?.year}/${edition?.number}`}
            </h2>
            <p className="text-on-surface-variant">
              {isNew ? "Configure e publique um novo diário oficial eletrônico." : `${STATUS_LABELS[status] || status} · ${items.length} matéria(s)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && <StatusBadge status={status as any} size="sm" />}
          {canReopenForEditing && (
            <button onClick={reopenEdition}
              className="flex items-center gap-2 px-5 py-2.5 border border-secondary text-secondary font-bold rounded-lg hover:bg-secondary/5 transition-all"
            >
              <span className="material-symbols-outlined">edit</span>
              Reabrir para editar
            </button>
          )}
          {hasItems && (
            <button onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-6 py-2.5 border border-primary text-primary font-bold rounded-lg hover:bg-primary/5 transition-all"
            >
              <span className="material-symbols-outlined">visibility</span>
              Preview
            </button>
          )}
        </div>
      </div>

      {hasItems && <Stepper current={step} />}

      {/* Step 1: Informações */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant space-y-6">
              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined">tag</span>
                <h3 className="text-headline-sm font-headline-sm">Identificação</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Número (Nº)</label>
                  <input type="number" value={number}
                    onChange={(e) => { const n = Number(e.target.value); setNumber(n); setTitle(`Diário Oficial - Edição ${String(n).padStart(2, '0')}`); setTouched((p) => ({ ...p, number: true })); }}
                    disabled={!isNew}
                    className={clsx("w-full h-12 rounded-lg border px-4 focus:ring-primary focus:border-primary outline-none", errors.number ? "border-error bg-error-container/20" : "border-outline-variant")} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Ano</label>
                  <input type="number" value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    disabled={!isNew}
                    className="w-full h-12 rounded-lg border border-outline-variant px-4 focus:ring-primary focus:border-primary outline-none" />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Título da Edição <span className="text-error">*</span></label>
                  <span className="text-[10px] text-on-surface-variant">{title.length}/200</span>
                </div>
                <input type="text" value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canAddItems && !isNew}
                  className="w-full h-14 rounded-lg border border-outline-variant focus:ring-primary focus:border-primary px-4 font-bold text-primary text-lg outline-none" />
              </div>
            </div>

            <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant">
              <div className="flex items-center gap-2 mb-6 text-primary">
                <span className="material-symbols-outlined">category</span>
                <h3 className="text-headline-sm font-headline-sm">Configurações da Edição</h3>
              </div>
              <div className="space-y-4 mb-8">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">Tipo de Edição</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {TYPE_OPTIONS.map((opt) => {
                    const isSelected = type === opt.value;
                    return (
                      <button key={opt.value} type="button" disabled={!isNew}
                        onClick={() => setType(opt.value)}
                        className={clsx("relative flex flex-col p-4 border-2 rounded-xl cursor-pointer transition-all text-left disabled:opacity-50",
                          isSelected ? "border-secondary bg-secondary-container/10" : "border-outline-variant/30 hover:border-primary/30"
                        )}
                      >
                        <span className={clsx("material-symbols-outlined mb-2", isSelected ? "text-secondary" : "text-primary")}>{opt.icon}</span>
                        <span className="font-bold text-sm text-on-surface">{opt.label}</span>
                        <span className="text-[10px] text-on-surface-variant">{opt.desc}</span>
                        {isSelected && (
                          <span className="absolute top-3 right-3 material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Data de Publicação <span className="text-error">*</span></label>
                  <div className="relative">
                    <input type="date" value={pubDate}
                      onChange={(e) => { setPubDate(e.target.value); setTouched((p) => ({ ...p, pubDate: true })); }}
                      disabled={!canAddItems && !isNew}
                      className={clsx("w-full h-12 rounded-lg border px-4 pl-10 focus:ring-primary focus:border-primary outline-none", errors.pubDate ? "border-error bg-error-container/20" : "border-outline-variant")} />
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">calendar_month</span>
                  </div>
                  {errors.pubDate && <p className="text-xs text-error mt-1">{errors.pubDate}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Subtítulo (Opcional)</label>
                  <input type="text" value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Descrição complementar"
                    disabled={!canAddItems && !isNew}
                    className="w-full h-12 rounded-lg border border-outline-variant px-4 focus:ring-primary focus:border-primary outline-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 h-full">
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant overflow-hidden flex flex-col min-h-[500px]">
              <div className="p-6 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">list_alt</span>
                  <h3 className="font-bold text-primary">Matérias na Edição</h3>
                </div>
                <span className="px-2 py-0.5 bg-outline-variant text-on-surface-variant text-[10px] font-bold rounded-full uppercase">
                  {editionId ? `${items.length} itens` : "0 itens"}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-48 h-48 mb-6 relative">
                  <div className="absolute inset-0 bg-primary/5 rounded-full scale-125 animate-pulse" />
                  <div className="relative bg-white rounded-2xl shadow-xl border border-outline-variant p-8 flex items-center justify-center h-full">
                    <span className="material-symbols-outlined text-6xl text-primary/20" style={{ fontVariationSettings: "'wght' 200" }}>menu_book</span>
                  </div>
                </div>
                <h4 className="text-headline-sm font-headline-sm text-primary mb-2">
                  {editionId ? "Matérias prontas para vínculo" : "Configure a edição primeiro"}
                </h4>
                <p className="text-on-surface-variant text-sm max-w-xs mx-auto">
                  {editionId
                    ? "Avançe para a próxima etapa para adicionar matérias a esta edição."
                    : "Após salvar os dados básicos, você poderá selecionar e adicionar as matérias aprovadas na próxima etapa."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Matérias */}
      {step === 2 && (editionId || edition?.id) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">inventory_2</span>
                Matérias Disponíveis
              </h3>
              <div className="relative">
                <input type="text" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-outline-variant rounded-full text-xs focus:ring-primary focus:border-primary w-64 outline-none"
                  placeholder="Buscar matéria..." />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">search</span>
              </div>
            </div>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {loadingMatters ? (
                <div className="text-center py-12 text-on-surface-variant"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Carregando...</div>
              ) : availableMatters.filter((m) => !usedMatterIds.has(m.id)).length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant">Nenhuma matéria disponível</div>
              ) : (
                availableMatters.filter((m) => !usedMatterIds.has(m.id)).map((m) => (
                  <div key={m.id} className="bg-surface-container-lowest p-4 border border-outline-variant rounded-xl shadow-sm hover:border-primary cursor-pointer group transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="px-2 py-0.5 bg-secondary-container/30 text-on-secondary-container text-[10px] font-bold rounded uppercase">
                        {m.act_type_id?.slice(0, 8) || "Ato"}
                      </span>
                      <span className="text-[10px] text-on-surface-variant font-medium">
                        {new Date(m.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <h4 className="font-bold text-on-surface mb-1 group-hover:text-primary transition-colors text-sm">{m.title}</h4>
                    {m.summary && <p className="text-xs text-on-surface-variant line-clamp-2">{m.summary}</p>}
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => addMatter(m.id)}
                        className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white transition-all">
                        <span className="material-symbols-outlined text-sm">add</span> Adicionar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-6 bg-surface-container-low border border-outline-variant rounded-xl p-6 h-full flex flex-col min-h-[600px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">playlist_add_check</span>
                Matérias Selecionadas
              </h3>
              <span className="px-3 py-1 bg-primary text-on-primary text-[10px] font-bold rounded-full uppercase">
                {items.length} selecionada{items.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex-1 flex flex-col gap-4">
              {items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-5xl mb-4 text-outline">playlist_add</span>
                  <p className="text-sm">Nenhuma matéria selecionada</p>
                </div>
              ) : (
                items.map((item, idx) => (
                  <div key={item.id} draggable={canAddItems}
                    onDragStart={() => setDragItemId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(idx)}
                    className={clsx("bg-surface-container-lowest border-l-4 border-primary rounded-lg p-4 shadow-sm flex items-center gap-4", dragItemId === item.id && "opacity-40")}
                  >
                    <span className="material-symbols-outlined text-outline-variant cursor-move">drag_indicator</span>
                    <div className="flex-1">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase">Ordem: {idx + 1}</span>
                      <h5 className="font-bold text-xs">{item.matter_title || item.matter_id.slice(0, 8)}</h5>
                    </div>
                    {canAddItems && (
                      <button onClick={() => removeItem(item.id)} className="text-error hover:bg-error/10 p-2 rounded-full transition-colors">
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="mt-6 p-4 border-t border-outline-variant flex justify-between items-center bg-white/50 rounded-b-xl">
              <p className="text-xs text-on-surface-variant">Arraste para reordenar a sequência no PDF final.</p>
              <span className="font-bold text-primary">Total: {items.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Fechar */}
      {step === 3 && (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-primary p-6 text-on-primary flex items-center justify-between">
              <div>
                <h3 className="text-headline-sm font-headline-sm">Resumo da Publicação</h3>
                <p className="text-on-primary/70 text-xs">Verifique os dados antes de finalizar.</p>
              </div>
              <span className="material-symbols-outlined text-4xl opacity-50">fact_check</span>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-8 pb-6 border-b border-outline-variant/30">
                <div className="space-y-4">
                  <div><p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Título da Edição</p><p className="font-bold text-lg">{title}</p></div>
                  <div><p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Identificação</p><p className="font-medium">Nº {number}/{year} · {TYPE_OPTIONS.find(t => t.value === type)?.label || type}</p></div>
                </div>
                <div className="space-y-4">
                  <div><p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Data Programada</p><p className="font-bold text-lg">{new Date(pubDate).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}</p></div>
                  <div><p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Quantidade de Matérias</p><p className="font-medium">{items.length} Matéria(s) vinculada(s)</p></div>
                </div>
              </div>
              {subtitle && (
                <div className="pb-6 border-b border-outline-variant/30">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Subtítulo</p>
                  <p className="font-medium">{subtitle}</p>
                </div>
              )}
              {/* Workflow actions */}
              {!isPublished && (
                <div className="space-y-3">
                  {canAddItems && (
                    <button onClick={closeEdition} className="w-full py-3 bg-surface-container-high text-on-surface font-bold rounded-xl hover:bg-surface-container-higher transition-all flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined">lock</span>
                      1. Fechar Edição
                    </button>
                  )}
                  {(isClosed || isPdfGenerated) && (
                    <button onClick={handleGeneratePdf} disabled={generatingPdf} className="w-full py-3 bg-on-tertiary-fixed-variant text-white font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                      {generatingPdf ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : null}
                      2. Gerar PDF
                    </button>
                  )}
                  {isPdfGenerated && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <select value={selectedCredentialId} onChange={(e) => setSelectedCredentialId(e.target.value)}
                          className="flex-1 px-3 py-3 border border-outline-variant rounded-xl text-sm outline-none">
                          <option value="">Certificado armazenado...</option>
                          {credentials.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <button onClick={handleSign} disabled={signing} className="px-6 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary-container transition-all flex items-center gap-2 disabled:opacity-50">
                        {signing ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : null}
                        3. Assinar
                        </button>
                      </div>
                      <input
                        type="password"
                        value={pfxPassword}
                        onChange={(e) => setPfxPassword(e.target.value)}
                        className="w-full px-3 py-3 border border-outline-variant rounded-xl text-sm outline-none"
                        placeholder="Senha do certificado"
                      />
                    </div>
                  )}
                  {isSigned && (
                    <button onClick={handlePublish} disabled={publishing} className="w-full py-3 bg-secondary text-on-secondary font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg">
                      {publishing ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : null}
                      4. Publicar
                    </button>
                  )}
                  {(isClosed || isPdfGenerated) && (
                    <button onClick={reopenEdition} className="w-full py-2 text-on-surface-variant text-sm hover:underline">Reabrir edição</button>
                  )}
                </div>
              )}
              {isPublished && (
                <div className="p-4 bg-secondary-container/30 rounded-xl flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="font-bold text-on-secondary-container">Edição publicada com sucesso!</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="mt-12 sticky bottom-8 flex justify-between items-center gap-4 p-4 bg-surface-container-lowest/80 backdrop-blur-md rounded-2xl border border-outline-variant/40 shadow-lg z-30">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          {hasItems && items.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-secondary">check_circle</span>
              {items.length} matéria(s) · {STATUS_LABELS[status] || status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isNew ? (
            <>
              <button onClick={() => router.push("/editions")} className="px-8 py-3 text-on-surface-variant font-bold hover:bg-surface-container-highest transition-colors rounded-xl">
                Cancelar
              </button>
              {step > 1 && (
                <button onClick={() => setStep((s) => s - 1)} className="px-8 py-3 text-on-surface-variant font-bold hover:bg-surface-container-highest transition-colors rounded-xl flex items-center gap-2">
                  <span className="material-symbols-outlined">arrow_back</span>
                  Anterior
                </button>
              )}
              {step === 1 && (
                <button onClick={async () => {
                  if (!validateStep(1)) return;
                  if (!editionId) await save();
                  setStep(2);
                }} disabled={saving}
                  className="px-10 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50">
                  <span>Avançar para Matérias</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              )}
              {step === 2 && (
                <button onClick={() => { if (validateStep(2)) setStep(3); }}
                  className="px-10 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2">
                  <span>Avançar para Fechar</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              )}
              {step === 3 && !isPublished && (
                <button onClick={() => setShowSignModal(true)}
                  className="px-10 py-3 bg-secondary text-on-secondary font-bold rounded-xl shadow-md hover:shadow-xl transition-all flex items-center gap-2">
                  <span className="material-symbols-outlined">send</span>
                  Fechar & Publicar
                </button>
              )}
            </>
          ) : (
            <>
              {step > 1 && (
                <button onClick={() => setStep((s) => s - 1)} className="px-8 py-3 text-on-surface-variant font-bold hover:bg-surface-container-highest transition-colors rounded-xl flex items-center gap-2">
                  <span className="material-symbols-outlined">arrow_back</span>
                  Anterior
                </button>
              )}
              {step < 3 && (
                <button onClick={() => {
                  if (step === 1 && !validateStep(1)) return;
                  if (step === 2 && !validateStep(2)) return;
                  setStep((s) => s + 1);
                }}
                  className="px-10 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-md hover:shadow-xl transition-all flex items-center gap-2">
                  <span>{step === 1 ? "Ir para Matérias" : "Ir para Fechamento"}</span>
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              )}
              {(status === "draft" || status === "reviewing") && (
                <button onClick={save} disabled={saving}
                  className="px-10 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-md hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50">
                  {saving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
                  Salvar
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showSignModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-headline-sm font-headline-sm text-primary">
                  Assinatura digital obrigatória
                </h3>
                <p className="text-body-sm text-on-surface-variant mt-1">
                  Informe a senha verdadeira do certificado para assinar o PDF e publicar a edição.
                </p>
              </div>
              <button
                onClick={() => !workflowRunning && setShowSignModal(false)}
                disabled={workflowRunning}
                className="p-2 rounded-lg hover:bg-surface-container-high disabled:opacity-50"
                aria-label="Fechar"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="block text-label-md font-label-md text-on-surface-variant mb-2">
                  Certificado armazenado
                </span>
                <select
                  value={selectedCredentialId}
                  onChange={(e) => {
                    setSelectedCredentialId(e.target.value);
                    if (e.target.value) setPfxFile(null);
                  }}
                  disabled={workflowRunning}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface outline-none"
                >
                  <option value="">Selecione um certificado...</option>
                  {credentials.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-label-md font-label-md text-on-surface-variant mb-2">
                  Ou arquivo PFX/P12
                </span>
                <input
                  type="file"
                  accept=".pfx,.p12"
                  disabled={workflowRunning || !!selectedCredentialId}
                  onChange={(e) => setPfxFile(e.target.files?.[0] ?? null)}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface outline-none"
                />
              </label>

              <label className="block">
                <span className="block text-label-md font-label-md text-on-surface-variant mb-2">
                  Senha do certificado
                </span>
                <input
                  type="password"
                  value={pfxPassword}
                  onChange={(e) => setPfxPassword(e.target.value)}
                  disabled={workflowRunning}
                  autoFocus
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface outline-none focus:border-primary"
                  placeholder="Digite a senha do certificado"
                />
              </label>

              {workflowMessage && (
                <div className="flex items-center gap-2 text-body-sm text-primary bg-primary-fixed/20 rounded-xl px-4 py-3">
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  {workflowMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSignModal(false)}
                disabled={workflowRunning}
                className="px-5 py-3 rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseSignPublish}
                disabled={workflowRunning || !pfxPassword || (!selectedCredentialId && !pfxFile)}
                className="px-6 py-3 rounded-xl font-bold bg-secondary text-on-secondary hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {workflowRunning && <span className="material-symbols-outlined animate-spin">progress_activity</span>}
                Assinar e publicar
              </button>
            </div>
          </div>
        </div>
      )}

      <EditionPreview open={showPreview} onClose={() => setShowPreview(false)} edition={currentEdition} />
    </div>
  );
}
