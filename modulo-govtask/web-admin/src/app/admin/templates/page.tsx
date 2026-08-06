"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TIPO_CONVENIO_LABELS, NATUREZA_ETAPA_LABELS } from "@/lib/utils";
import type { TemplateFluxo } from "@/types/govtask";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { FileStack, Plus, Pencil, Trash2, Layers } from "lucide-react";

export default function TemplatesPage() {
  const { hasRole } = useAuth();
  const router = useRouter();
  const isAdmin = hasRole("ADMIN");

  const [templates, setTemplates] = useState<TemplateFluxo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const data = await api.listTemplatesFluxo();
      setTemplates(data);
    } catch (e: any) {
      notify.error(e.message || "Erro ao carregar templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.deleteTemplateFluxo(deleteId);
      notify.success("Template excluído!");
      setDeleteId(null);
      load();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!isAdmin) {
    return (
      <EmptyState
        icon="alert-triangle"
        title="Acesso restrito"
        description="Apenas administradores podem gerenciar templates."
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Templates de Fluxo"
        description="Gerencie os templates de fluxo de etapas para convênios"
        actions={
          <Button icon={Plus} onClick={() => router.push("/admin/templates/novo")}>
            Novo Template
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="Nenhum template"
          description="Crie templates de fluxo para padronizar as etapas dos convênios."
          action={{ label: "Novo Template", href: "/admin/templates/novo" }}
        />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} padding="p-5" className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-title">{t.nome}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      label={TIPO_CONVENIO_LABELS[t.tipo_convenio] || t.tipo_convenio}
                      color="bg-[#1D4ED8]/10 text-[#1D4ED8]"
                    />
                    <span className="text-meta text-text-subtle flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {t.etapas?.length || 0} etapa(s)
                    </span>
                  </div>
                  {t.descricao && (
                    <p className="text-body-sm text-text-body mt-2">{t.descricao}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Pencil}
                    onClick={() => router.push(`/admin/templates/${t.id}/editar`)}
                  >{""}</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setDeleteId(t.id)}
                  >{""}</Button>
                </div>
              </div>

              {t.etapas && t.etapas.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {t.etapas
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((e, i) => (
                      <div key={e.id || i} className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8] flex items-center justify-center text-meta font-bold">
                          {e.ordem}
                        </span>
                        <span className="text-meta text-text-body">{e.nome}</span>
                        <Badge
                          label={NATUREZA_ETAPA_LABELS[e.natureza] || e.natureza}
                          color={
                            e.natureza === "GOVERNO"
                              ? "bg-[#B54708]/10 text-[#B54708]"
                              : "bg-[#1D4ED8]/10 text-[#1D4ED8]"
                          }
                        />
                        {i < t.etapas.length - 1 && (
                          <span className="text-text-subtle text-meta">→</span>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Template"
        message="Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  );
}
