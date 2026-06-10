"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { NATUREZA_ETAPA_LABELS } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  LayoutTemplate,
} from "lucide-react";

type EtapaItem = {
  id?: string;
  nome: string;
  natureza: "INTERNA" | "GOVERNO";
  ordem?: number;
};

export default function EditarTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN");

  const [nome, setNome] = useState("");
  const [tipoConvenio, setTipoConvenio] = useState("OBRA");
  const [descricao, setDescricao] = useState("");
  const [etapas, setEtapas] = useState<EtapaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getTemplateFluxo(id);
        setNome(data.nome);
        setTipoConvenio(data.tipo_convenio || "OBRA");
        setDescricao(data.descricao || "");
        setEtapas(
          (data.etapas || [])
            .sort((a, b) => a.ordem - b.ordem)
            .map((e) => ({
              id: e.id,
              nome: e.nome,
              natureza: e.natureza as "INTERNA" | "GOVERNO",
              ordem: e.ordem,
            }))
        );
        if (etapas.length === 0) {
          // Need to use a different approach
        }
      } catch (err: any) {
        if (err.message?.includes("404") || err.message?.includes("not found")) {
          setNotFound(true);
        } else {
          notify.error(err.message || "Erro ao carregar template");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (!isAdmin) {
    return (
      <EmptyState
        icon="alert-triangle"
        title="Acesso restrito"
        description="Apenas administradores podem editar templates."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton variant="card" className="h-64" />
        <Skeleton variant="card" className="h-48" />
      </div>
    );
  }

  if (notFound) {
    return (
      <EmptyState
        icon="alert-triangle"
        title="Template não encontrado"
        description="O template solicitado não foi localizado."
        action={{ label: "Voltar para Templates", href: "/admin/templates" }}
      />
    );
  }

  const addEtapa = () => {
    setEtapas([...etapas, { nome: "", natureza: "INTERNA" }]);
  };

  const removeEtapa = (index: number) => {
    if (etapas.length <= 1) return;
    setEtapas(etapas.filter((_, i) => i !== index));
  };

  const updateEtapa = (index: number, field: keyof EtapaItem, value: string) => {
    const updated = [...etapas];
    (updated[index] as any)[field] = value;
    setEtapas(updated);
  };

  const moveEtapa = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === etapas.length - 1) return;
    const updated = [...etapas];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    setEtapas(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      notify.error("Informe o nome do template");
      return;
    }

    const etapasInvalidas = etapas.some((ep) => !ep.nome.trim());
    if (etapasInvalidas) {
      notify.error("Preencha o nome de todas as etapas");
      return;
    }

    setSaving(true);
    try {
      await api.updateTemplateFluxo(id, {
        nome: nome.trim(),
        tipo_convenio: tipoConvenio,
        descricao: descricao.trim() || undefined,
        etapas: etapas.map((ep, i) => ({
          ...(ep.id ? { id: ep.id } : {}),
          nome: ep.nome.trim(),
          ordem: i + 1,
          natureza: ep.natureza,
        })),
      });
      notify.success("Template atualizado com sucesso!");
      router.push("/admin/templates");
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const templateTitle = nome || "Editar Template";

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={templateTitle}
        description="Edite o fluxo de etapas do template"
        breadcrumbs={[
          { label: "Admin" },
          { label: "Templates", href: "/admin/templates" },
          { label: nome || "Editar" },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card padding="p-6" className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-text-title mb-2">
              Nome do Template *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Fluxo Padrão Obra"
              className="w-full border border-surface-border rounded-card px-4 py-2.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              required
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-text-title mb-2">
              Tipo de Convênio
            </label>
            <select
              value={tipoConvenio}
              onChange={(e) => setTipoConvenio(e.target.value)}
              className="w-full border border-surface-border rounded-card px-4 py-2.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] bg-white"
            >
              <option value="OBRA">Obra</option>
              <option value="AQUISICAO">Aquisição</option>
              <option value="SERVICO">Serviço</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>

          <div>
            <label className="block text-body-sm font-medium text-text-title mb-2">
              Descrição
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva o propósito deste template de fluxo..."
              className="w-full border border-surface-border rounded-card px-4 py-3 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] min-h-[80px] resize-y"
              rows={3}
            />
          </div>
        </Card>

        {/* Etapas builder */}
        <Card padding="p-6" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-title">Etapas do Fluxo</h2>
            <span className="text-meta text-text-subtle">{etapas.length} etapa(s)</span>
          </div>

          <div className="space-y-3">
            {etapas.map((ep, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-3 bg-surface-bg rounded-card border border-surface-border"
              >
                <div className="flex flex-col gap-0.5 pt-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveEtapa(i, "up")}
                    disabled={i === 0}
                    className="text-text-subtle hover:text-text-body disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <GripVertical className="w-4 h-4 text-text-subtle" />
                  <button
                    type="button"
                    onClick={() => moveEtapa(i, "down")}
                    disabled={i === etapas.length - 1}
                    className="text-text-subtle hover:text-text-body disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-1">
                    <span className="w-6 h-6 rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8] flex items-center justify-center text-meta font-bold shrink-0">
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      value={ep.nome}
                      onChange={(e) => updateEtapa(i, "nome", e.target.value)}
                      placeholder="Nome da etapa"
                      className="flex-1 border border-surface-border rounded-btn px-3 py-1.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>
                  <select
                    value={ep.natureza}
                    onChange={(e) => updateEtapa(i, "natureza", e.target.value)}
                    className="w-full sm:w-auto border border-surface-border rounded-btn px-3 py-1.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] bg-white"
                  >
                    <option value="INTERNA">Interna</option>
                    <option value="GOVERNO">Governo</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => removeEtapa(i)}
                  disabled={etapas.length <= 1}
                  className="text-text-subtle hover:text-[#B42318] disabled:opacity-30 transition-colors pt-2 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addEtapa}
            className="flex items-center gap-2 text-body-sm text-[#1D4ED8] hover:text-[#1D4ED8]/80 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Etapa
          </button>
        </Card>

        {/* Preview */}
        {etapas.some((ep) => ep.nome.trim()) && (
          <Card padding="p-6">
            <h2 className="font-semibold text-text-title mb-4 flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4" />
              Pré-visualização do Fluxo
            </h2>
            <div className="flex items-center gap-1 flex-wrap">
              {etapas
                .filter((ep) => ep.nome.trim())
                .map((ep, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div
                      className={`px-3 py-1.5 rounded-card text-meta font-medium border ${
                        ep.natureza === "GOVERNO"
                          ? "bg-[#B54708]/5 border-[#B54708]/30 text-[#B54708]"
                          : "bg-[#1D4ED8]/5 border-[#1D4ED8]/30 text-[#1D4ED8]"
                      }`}
                    >
                      {i + 1}. {ep.nome}
                      <span className="ml-1 text-meta opacity-60">
                        ({NATUREZA_ETAPA_LABELS[ep.natureza]})
                      </span>
                    </div>
                    {i < etapas.filter((ep) => ep.nome.trim()).length - 1 && (
                      <span className="text-text-subtle font-bold">→</span>
                    )}
                  </div>
                ))}
            </div>
          </Card>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            icon={ArrowLeft}
            onClick={() => router.push("/admin/templates")}
          >
            Cancelar
          </Button>
          <Button type="submit" icon={Save} loading={saving}>
            Salvar Alterações
          </Button>
        </div>
      </form>
    </div>
  );
}
