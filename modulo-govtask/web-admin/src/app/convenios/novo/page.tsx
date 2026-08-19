"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { notify } from "@/components/ui/Toast";
import { TIPO_CONVENIO_LABELS, NATUREZA_ETAPA_LABELS, CATEGORIA_RECURSO_LABELS, ESFERA_LABELS, PRIORIDADE_PROCESSO_LABELS } from "@/lib/utils";
import type { TemplateFluxo } from "@/types/govtask";
import {
  Save,
  Play,
  ArrowLeft,
  FileText,
  ChevronRight,
} from "lucide-react";

interface FormData {
  titulo: string;
  descricao: string;
  tipo: string;
  origem: string;
  valor: string;
  template_fluxo_id: string;
  categoria: string;
  esfera: string;
  prioridade: string;
  parlamentar: string;
  parlamentar_cargo: string;
  partido: string;
  orgao_concedente: string;
  programa: string;
  finalidade: string;
  numero_proposta: string;
  numero_convenio: string;
  numero_emenda: string;
  numero_plano_acao: string;
  numero_plano_trabalho: string;
  valor_solicitado: string;
  valor_aprovado: string;
  valor_repasse: string;
  contrapartida: string;
  vigencia_inicio: string;
  vigencia_fim: string;
  prazo_execucao: string;
  prazo_prestacao_contas: string;
  previsao_conclusao: string;
}

interface FormErrors {
  titulo?: string;
}

export default function NovoConvenioPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    titulo: "",
    descricao: "",
    tipo: "OBRA",
    origem: "",
    valor: "",
    template_fluxo_id: "",
    categoria: "",
    esfera: "",
    prioridade: "",
    parlamentar: "",
    parlamentar_cargo: "",
    partido: "",
    orgao_concedente: "",
    programa: "",
    finalidade: "",
    numero_proposta: "",
    numero_convenio: "",
    numero_emenda: "",
    numero_plano_acao: "",
    numero_plano_trabalho: "",
    valor_solicitado: "",
    valor_aprovado: "",
    valor_repasse: "",
    contrapartida: "",
    vigencia_inicio: "",
    vigencia_fim: "",
    prazo_execucao: "",
    prazo_prestacao_contas: "",
    previsao_conclusao: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<TemplateFluxo[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateFluxo | null>(null);
  const [valorFmt, setValorFmt] = useState("");
  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await api.listTemplatesFluxo();
        setTemplates(data);
      } catch {
        // templates are optional
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, []);

  useEffect(() => {
    if (templates.length > 0 && form.template_fluxo_id) {
      const tpl = templates.find((t) => t.id === form.template_fluxo_id);
      setSelectedTemplate(tpl || null);
    } else {
      setSelectedTemplate(null);
    }
  }, [form.template_fluxo_id, templates]);

  useEffect(() => {
    if (form.tipo && !form.template_fluxo_id && templates.length > 0) {
      const matching = templates.find((t) => t.tipo_convenio === form.tipo);
      if (matching) {
        setForm((prev) => ({ ...prev, template_fluxo_id: matching.id }));
      }
    }
  }, [form.tipo, templates]);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const num = Number(raw) / 100;
    if (raw === "") {
      setValorFmt("");
      setForm({ ...form, valor: "" });
      return;
    }
    const formatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
    setValorFmt(formatted);
    setForm({ ...form, valor: String(num) });
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!form.titulo.trim()) {
      newErrors.titulo = "Título é obrigatório";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (status: "RASCUNHO" | "EM_ANDAMENTO") => {
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
        categoria: form.categoria || undefined,
        esfera: form.esfera || undefined,
        prioridade: form.prioridade || undefined,
        parlamentar: form.parlamentar.trim() || undefined,
        parlamentar_cargo: form.parlamentar_cargo.trim() || undefined,
        partido: form.partido.trim() || undefined,
        orgao_concedente: form.orgao_concedente.trim() || undefined,
        programa: form.programa.trim() || undefined,
        finalidade: form.finalidade.trim() || undefined,
        numero_proposta: form.numero_proposta.trim() || undefined,
        numero_convenio: form.numero_convenio.trim() || undefined,
        numero_emenda: form.numero_emenda.trim() || undefined,
        numero_plano_acao: form.numero_plano_acao.trim() || undefined,
        numero_plano_trabalho: form.numero_plano_trabalho.trim() || undefined,
        valor_solicitado: form.valor_solicitado ? parseFloat(form.valor_solicitado) : undefined,
        valor_aprovado: form.valor_aprovado ? parseFloat(form.valor_aprovado) : undefined,
        valor_repasse: form.valor_repasse ? parseFloat(form.valor_repasse) : undefined,
        contrapartida: form.contrapartida ? parseFloat(form.contrapartida) : undefined,
        vigencia_inicio: form.vigencia_inicio || undefined,
        vigencia_fim: form.vigencia_fim || undefined,
        prazo_execucao: form.prazo_execucao || undefined,
        prazo_prestacao_contas: form.prazo_prestacao_contas || undefined,
        previsao_conclusao: form.previsao_conclusao || undefined,
      };

      const convenio = await api.createConvenio(payload as any);

      if (status === "EM_ANDAMENTO") {
        await api.updateConvenio(convenio.id, { status: "EM_ANDAMENTO" });
        notify.success("Convênio criado com sucesso!");
        router.push(`/convenios/${convenio.id}`);
      } else {
        const updated = await api.updateConvenio(convenio.id, { status: "RASCUNHO" });
        notify.success("Convênio salvo como rascunho!");
        router.push(`/convenios/${(updated as any).id || convenio.id}`);
      }
    } catch (e: any) {
      notify.error(e.message || "Erro ao criar convênio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Novo Processo"
        title="Novo Convênio"
        description="Preencha os dados para criar um novo convênio"
        breadcrumbs={[
          { label: "Convênios", href: "/convenios" },
          { label: "Novo Convênio" },
        ]}
        actions={
          <Button variant="ghost" icon={ArrowLeft} onClick={() => router.back()}>
            Voltar
          </Button>
        }
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main form */}
        <div className="flex-1 space-y-6">
          <Card padding="p-6">
            <h2 className="text-h3 text-text-title mb-4">Dados do Convênio</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-label text-text-title mb-1">
                  Título <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={(e) =>
                    setForm({ ...form, titulo: e.target.value })
                  }
                  placeholder="Ex: Construção da Escola Municipal..."
                  className={`w-full border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 ${
                    errors.titulo
                      ? "border-[#B42318] focus:ring-[#B42318]/20"
                      : "border-surface-border focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                  }`}
                />
                {errors.titulo && (
                  <p className="text-meta text-[#B42318] mt-1">{errors.titulo}</p>
                )}
              </div>

              <div>
                <label className="block text-label text-text-title mb-1">
                  Descrição
                </label>
                <textarea
                  value={form.descricao}
                  onChange={(e) =>
                    setForm({ ...form, descricao: e.target.value })
                  }
                  placeholder="Descreva o objetivo e escopo do convênio..."
                  rows={4}
                  className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-label text-text-title mb-1">
                    Tipo
                  </label>
                  <select
                    value={form.tipo}
                    onChange={(e) =>
                      setForm({ ...form, tipo: e.target.value })
                    }
                    className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                  >
                    <option value="OBRA">Obra</option>
                    <option value="AQUISICAO">Aquisição</option>
                    <option value="SERVICO">Serviço</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-label text-text-title mb-1">
                    Origem
                  </label>
                  <input
                    type="text"
                    value={form.origem}
                    onChange={(e) =>
                      setForm({ ...form, origem: e.target.value })
                    }
                    placeholder="Ex: Governo do Estado do Paraná"
                    className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-label text-text-title mb-1">
                  Valor (R$)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={valorFmt}
                  onChange={handleValorChange}
                  placeholder="R$ 0,00"
                  className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                />
              </div>
            </div>
          </Card>

          {/* Origem do Recurso */}
          <Card padding="p-6">
            <h2 className="text-h3 text-text-title mb-1">Origem e Identificação</h2>
            <p className="text-body-sm text-text-body mb-4">Dados de origem política, concedente e instrumentos.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-label text-text-title mb-1">Categoria do Recurso</label>
                  <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]">
                    <option value="">Selecione...</option>
                    {Object.entries(CATEGORIA_RECURSO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Esfera</label>
                  <select value={form.esfera} onChange={(e) => setForm({ ...form, esfera: e.target.value })} className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]">
                    <option value="">Selecione...</option>
                    {Object.entries(ESFERA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Prioridade</label>
                  <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]">
                    <option value="">Selecione...</option>
                    {Object.entries(PRIORIDADE_PROCESSO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-label text-text-title mb-1">Parlamentar</label>
                  <input type="text" value={form.parlamentar} onChange={(e) => setForm({ ...form, parlamentar: e.target.value })} placeholder="Dep. Fulano" className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Cargo</label>
                  <input type="text" value={form.parlamentar_cargo} onChange={(e) => setForm({ ...form, parlamentar_cargo: e.target.value })} placeholder="Deputado Federal" className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Partido</label>
                  <input type="text" value={form.partido} onChange={(e) => setForm({ ...form, partido: e.target.value })} placeholder="Partido" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-label text-text-title mb-1">Órgão Concedente</label>
                  <input type="text" value={form.orgao_concedente} onChange={(e) => setForm({ ...form, orgao_concedente: e.target.value })} placeholder="Ex: Ministério da Educação" className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Programa</label>
                  <input type="text" value={form.programa} onChange={(e) => setForm({ ...form, programa: e.target.value })} placeholder="Ex: PAC Creches" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-label text-text-title mb-1">Finalidade</label>
                <textarea value={form.finalidade} onChange={(e) => setForm({ ...form, finalidade: e.target.value })} rows={2} placeholder="Finalidade do recurso..." className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-label text-text-title mb-1">Número da Proposta</label>
                  <input type="text" value={form.numero_proposta} onChange={(e) => setForm({ ...form, numero_proposta: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Número do Convênio</label>
                  <input type="text" value={form.numero_convenio} onChange={(e) => setForm({ ...form, numero_convenio: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Número da Emenda</label>
                  <input type="text" value={form.numero_emenda} onChange={(e) => setForm({ ...form, numero_emenda: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Plano de Ação</label>
                  <input type="text" value={form.numero_plano_acao} onChange={(e) => setForm({ ...form, numero_plano_acao: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Plano de Trabalho</label>
                  <input type="text" value={form.numero_plano_trabalho} onChange={(e) => setForm({ ...form, numero_plano_trabalho: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>
          </Card>

          {/* Valores e Datas */}
          <Card padding="p-6">
            <h2 className="text-h3 text-text-title mb-1">Valores e Datas</h2>
            <p className="text-body-sm text-text-body mb-4">Planejamento financeiro e prazos do instrumento.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-label text-text-title mb-1">Valor Solicitado</label>
                  <input type="number" step="0.01" value={form.valor_solicitado} onChange={(e) => setForm({ ...form, valor_solicitado: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Valor Aprovado</label>
                  <input type="number" step="0.01" value={form.valor_aprovado} onChange={(e) => setForm({ ...form, valor_aprovado: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Valor Repasse</label>
                  <input type="number" step="0.01" value={form.valor_repasse} onChange={(e) => setForm({ ...form, valor_repasse: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Contrapartida</label>
                  <input type="number" step="0.01" value={form.contrapartida} onChange={(e) => setForm({ ...form, contrapartida: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-label text-text-title mb-1">Vigência Início</label>
                  <input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Vigência Fim</label>
                  <input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Prazo Execução</label>
                  <input type="date" value={form.prazo_execucao} onChange={(e) => setForm({ ...form, prazo_execucao: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Prazo Prestação</label>
                  <input type="date" value={form.prazo_prestacao_contas} onChange={(e) => setForm({ ...form, prazo_prestacao_contas: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-label text-text-title mb-1">Previsão Conclusão</label>
                  <input type="date" value={form.previsao_conclusao} onChange={(e) => setForm({ ...form, previsao_conclusao: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>
          </Card>

          {/* Template de Fluxo */}
          <Card padding="p-6">
            <h2 className="text-h3 text-text-title mb-1">
              Template de Fluxo
            </h2>
            <p className="text-body-sm text-text-body mb-4">
              Selecione um template para pré-definir as etapas do convênio
            </p>

            {loadingTemplates ? (
              <div className="space-y-3">
                <div className="skeleton h-10 w-full rounded-btn" />
                <div className="skeleton h-20 w-full rounded-card" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-6 text-text-subtle text-body-sm">
                Nenhum template disponível. As etapas poderão ser criadas manualmente após salvar.
              </div>
            ) : (
              <select
                value={form.template_fluxo_id}
                onChange={(e) =>
                  setForm({ ...form, template_fluxo_id: e.target.value })
                }
                className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] mb-4"
              >
                <option value="">Nenhum (criar etapas manualmente)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({TIPO_CONVENIO_LABELS[t.tipo_convenio] || t.tipo_convenio})
                  </option>
                ))}
              </select>
            )}

            {selectedTemplate && (
              <div className="bg-[#F6F7F9] rounded-card p-4">
                <h4 className="text-label text-text-title mb-2">
                  Etapas que serão criadas:
                </h4>
                <div className="space-y-1">
                  {selectedTemplate.etapas
                    .slice()
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((etapa, i) => (
                      <div
                        key={etapa.id || i}
                        className="flex items-center gap-2 text-body-sm text-text-body"
                      >
                        <span className="w-5 h-5 rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8] flex items-center justify-center text-meta font-bold shrink-0">
                          {etapa.ordem}
                        </span>
                        <span>{etapa.nome}</span>
                        <span className="text-meta text-text-subtle">
                          ({NATUREZA_ETAPA_LABELS[etapa.natureza] || etapa.natureza})
                        </span>
                        {i < selectedTemplate.etapas.length - 1 && (
                          <ChevronRight className="w-3 h-3 text-text-subtle" />
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-[380px] shrink-0">
          <div className="lg:sticky lg:top-6 space-y-4">
            <Card padding="p-6">
              <h3 className="text-h3 text-text-title mb-3">Resumo</h3>

              <div className="space-y-3">
                <div>
                  <p className="text-meta text-text-subtle">Título</p>
                  <p className="text-body-sm text-text-title">
                    {form.titulo || <span className="text-text-subtle italic">Não informado</span>}
                  </p>
                </div>
                <div>
                  <p className="text-meta text-text-subtle">Tipo</p>
                  <p className="text-body-sm text-text-title">
                    {TIPO_CONVENIO_LABELS[form.tipo] || form.tipo}
                  </p>
                </div>
                <div>
                  <p className="text-meta text-text-subtle">Categoria</p>
                  <p className="text-body-sm text-text-title">
                    {form.categoria ? (CATEGORIA_RECURSO_LABELS[form.categoria] || form.categoria) : <span className="text-text-subtle italic">—</span>}
                  </p>
                </div>
                <div>
                  <p className="text-meta text-text-subtle">Esfera</p>
                  <p className="text-body-sm text-text-title">
                    {form.esfera ? (ESFERA_LABELS[form.esfera] || form.esfera) : <span className="text-text-subtle italic">—</span>}
                  </p>
                </div>
                <div>
                  <p className="text-meta text-text-subtle">Origem</p>
                  <p className="text-body-sm text-text-title">
                    {form.origem || <span className="text-text-subtle italic">—</span>}
                  </p>
                </div>
                <div>
                  <p className="text-meta text-text-subtle">Valor estimado</p>
                  <p className="text-body-sm text-text-title tabular-nums">
                    {valorFmt || <span className="text-text-subtle italic">—</span>}
                  </p>
                </div>
                <div>
                  <p className="text-meta text-text-subtle">Template</p>
                  <p className="text-body-sm text-text-title">
                    {selectedTemplate ? selectedTemplate.nome : "Nenhum selecionado"}
                  </p>
                </div>
              </div>

              {selectedTemplate && (
                <>
                  <hr className="my-4 border-surface-border" />
                  <h4 className="text-label text-text-title mb-2">
                    Preview do Fluxo
                  </h4>
                  <div className="space-y-1">
                    {selectedTemplate.etapas
                      .slice()
                      .sort((a, b) => a.ordem - b.ordem)
                      .map((etapa, i) => (
                        <div
                          key={etapa.id || i}
                          className="flex items-center gap-2 text-body-sm"
                        >
                          <div className="flex flex-col items-center">
                            <div
                              className={`w-3 h-3 rounded-full border-2 ${
                                i === 0
                                  ? "bg-[#1D4ED8] border-[#1D4ED8]"
                                  : "bg-transparent border-[#98A2B3]"
                              }`}
                            />
                            {i < selectedTemplate.etapas.length - 1 && (
                              <div className="w-0.5 h-3 bg-[#E4E7EC]" />
                            )}
                          </div>
                          <span className="text-text-body">{etapa.nome}</span>
                          <span className="text-meta text-text-subtle">
                            {NATUREZA_ETAPA_LABELS[etapa.natureza] || etapa.natureza}
                          </span>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-white border-t border-surface-border p-4 -mx-6 lg:-mx-8 flex items-center justify-between rounded-t-card shadow-elevated">
        <Button variant="ghost" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            icon={Save}
            onClick={() => handleSave("RASCUNHO")}
            loading={saving}
          >
            Salvar como Rascunho
          </Button>
          <Button
            icon={Play}
            onClick={() => handleSave("EM_ANDAMENTO")}
            loading={saving}
          >
            Criar e Abrir
          </Button>
        </div>
      </div>
    </div>
  );
}
