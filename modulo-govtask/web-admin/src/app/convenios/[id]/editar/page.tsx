"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Badge } from "@/components/ui/Badge";
import { notify } from "@/components/ui/Toast";
import { TIPO_CONVENIO_LABELS, NATUREZA_ETAPA_LABELS } from "@/lib/utils";
import type { Convenio, TemplateFluxo, TemplateEtapa } from "@/types/govtask";
import { Save, ArrowLeft, XCircle, RefreshCw, Trash2, GripVertical } from "lucide-react";

interface FormData {
  titulo: string;
  descricao: string;
  tipo: string;
  origem: string;
  valor: string;
  status: string;
  template_fluxo_id: string;
}

interface FormErrors {
  titulo?: string;
}

export default function EditarConvenioPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const canEdit = hasRole("ASSESSOR", "ADMIN");
  const [convenio, setConvenio] = useState<Convenio | null>(null);
  const [templates, setTemplates] = useState<TemplateFluxo[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateFluxo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    titulo: "", descricao: "", tipo: "OBRA", origem: "", valor: "", status: "RASCUNHO", template_fluxo_id: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [valorFmt, setValorFmt] = useState("");
  const [confirmDeleteEtapa, setConfirmDeleteEtapa] = useState<string | null>(null);

  const [etapasLocais, setEtapasLocais] = useState<{ id?: string; nome: string; ordem: number; natureza: string }[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, temps] = await Promise.all([
        api.getConvenio(id),
        api.listTemplatesFluxo().catch(() => [] as TemplateFluxo[]),
      ]);
      setConvenio(data);
      setTemplates(temps);
      const rawValor = data.valor ? String(data.valor) : "";
      setForm({
        titulo: data.titulo || "",
        descricao: data.descricao || "",
        tipo: data.tipo || "OBRA",
        origem: data.origem || "",
        valor: rawValor,
        status: data.status || "RASCUNHO",
        template_fluxo_id: data.template_fluxo_id || "",
      });
      if (data.valor) {
        const formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(data.valor);
        setValorFmt(formatted);
      }
      if (data.template_fluxo_id) {
        const t = temps.find((x) => x.id === data.template_fluxo_id);
        if (t) setSelectedTemplate(t);
      }
      const existingEtapas = (data.etapas || []).slice().sort((a, b) => a.ordem - b.ordem);
      setEtapasLocais(existingEtapas.map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem, natureza: e.natureza })));
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erro ao carregar convênio");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const num = Number(raw) / 100;
    if (raw === "") { setValorFmt(""); setForm({ ...form, valor: "" }); return; }
    setValorFmt(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num));
    setForm({ ...form, valor: String(num) });
  };

  const handleTemplateChange = (templateId: string) => {
    setForm({ ...form, template_fluxo_id: templateId });
    const t = templates.find((x) => x.id === templateId);
    setSelectedTemplate(t || null);
  };

  const aplicarTemplate = () => {
    if (!selectedTemplate || !selectedTemplate.etapas) return;
    const novas = selectedTemplate.etapas.map((e, i) => ({ nome: e.nome, ordem: i + 1, natureza: e.natureza }));
    setEtapasLocais(novas);
    notify.success("Etapas do template aplicadas!");
  };

  const addEtapaManual = () => {
    setEtapasLocais([...etapasLocais, { nome: "", ordem: etapasLocais.length + 1, natureza: "INTERNA" }]);
  };

  const updateEtapaLocal = (idx: number, field: string, value: string) => {
    const updated = [...etapasLocais];
    (updated[idx] as any)[field] = value;
    setEtapasLocais(updated);
  };

  const removeEtapaLocal = (idx: number) => {
    const updated = etapasLocais.filter((_, i) => i !== idx);
    setEtapasLocais(updated.map((e, i) => ({ ...e, ordem: i + 1 })));
    setConfirmDeleteEtapa(null);
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!form.titulo.trim()) newErrors.titulo = "Título é obrigatório";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || undefined,
        tipo: form.tipo,
        origem: form.origem.trim() || undefined,
        valor: form.valor ? parseFloat(form.valor) : undefined,
        template_fluxo_id: form.template_fluxo_id || undefined,
      };
      if (form.status === "RASCUNHO" || form.status === "EM_ANDAMENTO") {
        payload.status = form.status;
      }
      await api.updateConvenio(id, payload);

      // Sync etapas: create new ones, update existing, delete removed
      const existingIds = (convenio?.etapas || []).map((e) => e.id);
      const localIds = etapasLocais.filter((e) => e.id).map((e) => e.id!);
      const toDelete = existingIds.filter((eid) => !localIds.includes(eid));
      for (const eid of toDelete) {
        await api.deleteEtapa(eid);
      }
      for (const e of etapasLocais) {
        if (!e.nome.trim()) continue;
        if (e.id) {
          await api.updateEtapa(e.id, { nome: e.nome.trim(), ordem: e.ordem, natureza: e.natureza });
        } else {
          await api.createEtapa(id, { nome: e.nome.trim(), ordem: e.ordem, natureza: e.natureza });
        }
      }

      notify.success("Convênio atualizado com sucesso!");
      router.push(`/convenios/${id}`);
    } catch (e: any) {
      notify.error(e.message || "Erro ao atualizar convênio");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="" breadcrumbs={[{ label: "Convênios", href: "/convenios" }, { label: "..." }, { label: "Editar" }]} />
        <Skeleton variant="card" className="h-96" />
      </div>
    );
  }

  if (error || !convenio) {
    return (
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="" breadcrumbs={[{ label: "Convênios", href: "/convenios" }, { label: "Editar" }]} />
        <Card padding="p-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEE4E2] flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-6 h-6 text-[#B42318]" />
            </div>
            <h3 className="text-h3 text-[#101828] mb-1">{error || "Convênio não encontrado"}</h3>
            <p className="text-body-sm text-[#475467] mb-4">Não foi possível carregar os dados para edição.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => router.push("/convenios")}>Voltar</Button>
              <Button icon={RefreshCw} onClick={load}>Tentar novamente</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const canChangeStatus = convenio.status === "RASCUNHO" || convenio.status === "EM_ANDAMENTO";

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={`Editar: ${convenio.titulo}`}
        description="Altere os dados e o fluxo de etapas do convênio"
        breadcrumbs={[{ label: "Convênios", href: "/convenios" }, { label: convenio.titulo, href: `/convenios/${id}` }, { label: "Editar" }]}
        actions={<Button variant="ghost" icon={ArrowLeft} onClick={() => router.push(`/convenios/${id}`)}>Voltar</Button>}
      />

      <form onSubmit={handleSubmit}>
        {/* Dados básicos */}
        <Card padding="p-6">
          <h2 className="font-semibold text-[#101828] mb-4 text-lg">Dados do Convênio</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-label text-[#101828] mb-1">Título <span className="text-[#B42318]">*</span></label>
              <input type="text" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className={`w-full border rounded-btn px-3 py-2 text-sm bg-white text-[#101828] focus:outline-none focus:ring-2 ${errors.titulo ? "border-[#B42318] focus:ring-[#B42318]/20" : "border-[#E4E7EC] focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"}`} />
              {errors.titulo && <p className="text-meta text-[#B42318] mt-1">{errors.titulo}</p>}
            </div>
            <div>
              <label className="block text-label text-[#101828] mb-1">Descrição</label>
              <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={3}
                className="w-full border border-[#E4E7EC] rounded-btn px-3 py-2 text-sm bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-label text-[#101828] mb-1">Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="w-full border border-[#E4E7EC] rounded-btn px-3 py-2 text-sm bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]">
                  <option value="OBRA">Obra</option>
                  <option value="AQUISICAO">Aquisição</option>
                  <option value="SERVICO">Serviço</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-label text-[#101828] mb-1">Origem</label>
                <input type="text" value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })}
                  placeholder="Governo do Estado" className="w-full border border-[#E4E7EC] rounded-btn px-3 py-2 text-sm bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]" />
              </div>
              <div>
                <label className="block text-label text-[#101828] mb-1">Valor (R$)</label>
                <input type="text" inputMode="numeric" value={valorFmt} onChange={handleValorChange} placeholder="R$ 0,00"
                  className="w-full border border-[#E4E7EC] rounded-btn px-3 py-2 text-sm bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]" />
              </div>
            </div>
            <div>
              <label className="block text-label text-[#101828] mb-1">Status</label>
              {canChangeStatus ? (
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full sm:w-48 border border-[#E4E7EC] rounded-btn px-3 py-2 text-sm bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]">
                  <option value="RASCUNHO">Rascunho</option>
                  <option value="EM_ANDAMENTO">Em Andamento</option>
                </select>
              ) : (
                <div className="flex items-center gap-2"><StatusPill status={convenio.status} /><span className="text-meta text-[#98A2B3]">(não pode ser alterado)</span></div>
              )}
            </div>
          </div>
        </Card>

        {/* Template de Fluxo */}
        <Card padding="p-6" className="mt-6">
          <h2 className="font-semibold text-[#101828] mb-4 text-lg">Template de Fluxo</h2>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-label text-[#101828] mb-1">Selecionar template</label>
              <select value={form.template_fluxo_id} onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full border border-[#E4E7EC] rounded-btn px-3 py-2 text-sm bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]">
                <option value="">Nenhum (etapas manuais)</option>
                {templates.map((t) => (<option key={t.id} value={t.id}>{t.nome} ({TIPO_CONVENIO_LABELS[t.tipo_convenio] || t.tipo_convenio})</option>))}
              </select>
            </div>
            {selectedTemplate && (
              <Button variant="secondary" onClick={aplicarTemplate} size="sm" type="button">
                Aplicar etapas do template
              </Button>
            )}
          </div>
          {selectedTemplate && (
            <div className="mt-3 p-3 bg-[#F6F7F9] rounded-card border border-[#E4E7EC]">
              <p className="text-meta text-[#667085]">{selectedTemplate.descricao || "Sem descrição"}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {(selectedTemplate.etapas || []).map((e, i) => (
                  <span key={i} className="text-meta px-2 py-0.5 bg-white rounded border border-[#E4E7EC] text-[#475467]">
                    {i + 1}. {e.nome} <span className="text-[#98A2B3]">({NATUREZA_ETAPA_LABELS[e.natureza] || e.natureza})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Etapas */}
        <Card padding="p-6" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#101828] text-lg">Etapas ({etapasLocais.length})</h2>
            <Button variant="secondary" size="sm" onClick={addEtapaManual} type="button">+ Adicionar etapa</Button>
          </div>
          {etapasLocais.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-[#E4E7EC] rounded-card">
              <p className="text-body-sm text-[#98A2B3]">Nenhuma etapa definida</p>
              <p className="text-meta text-[#98A2B3] mt-1">Selecione um template acima ou adicione etapas manualmente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {etapasLocais.map((e, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-[#F6F7F9] rounded-card border border-[#E4E7EC] group">
                  <GripVertical className="w-4 h-4 text-[#98A2B3] shrink-0 cursor-grab" />
                  <span className="text-meta font-medium text-[#98A2B3] w-5">{idx + 1}.</span>
                  <input type="text" value={e.nome} onChange={(ev) => updateEtapaLocal(idx, "nome", ev.target.value)}
                    placeholder="Nome da etapa" className="flex-1 border border-[#E4E7EC] rounded-btn px-3 py-1.5 text-sm bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]" />
                  <select value={e.natureza} onChange={(ev) => updateEtapaLocal(idx, "natureza", ev.target.value)}
                    className="w-28 border border-[#E4E7EC] rounded-btn px-2 py-1.5 text-sm bg-white text-[#101828] focus:outline-none">
                    <option value="INTERNA">Interna</option>
                    <option value="GOVERNO">Governo</option>
                  </select>
                  <button type="button" onClick={() => setConfirmDeleteEtapa(String(idx))}
                    className="p-1.5 rounded-btn hover:bg-[#FEE4E2] text-[#98A2B3] hover:text-[#B42318] opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-[#E4E7EC] p-4 mt-6 rounded-t-card shadow-elevated flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.push(`/convenios/${id}`)} disabled={saving}>Cancelar</Button>
          <Button icon={Save} type="submit" loading={saving}>Salvar Alterações</Button>
        </div>
      </form>

      <ConfirmModal
        open={confirmDeleteEtapa !== null}
        onClose={() => setConfirmDeleteEtapa(null)}
        onConfirm={() => { if (confirmDeleteEtapa !== null) removeEtapaLocal(parseInt(confirmDeleteEtapa)); }}
        title="Remover etapa"
        message="Tem certeza que deseja remover esta etapa?"
        confirmLabel="Remover"
      />
    </div>
  );
}
