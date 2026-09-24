"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import EmptyState from "@/components/EmptyState";
import type {
  DocumentModelDetail,
  InstitutionalProfile,
  VersionDetail,
} from "@/types/document_model";
import DocumentModelBuilder from "@/components/DocumentModelBuilder/DocumentModelBuilder";

export default function DocumentModelBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [model, setModel] = useState<DocumentModelDetail | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [institution, setInstitution] = useState<InstitutionalProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await api.getDocumentModel(id);
      setModel(detail);
      // Prioriza a versão em trabalho (rascunho ou em aprovação) mais recente.
      // Sem isso, ao enviar um rascunho para aprovação o construtor cairia de
      // volta na versão ativa anterior e pareceria "perder" todo o conteúdo.
      const pending = detail.versions
        .filter((v) => v.status === "draft" || v.status === "in_approval")
        .sort((a, b) => b.version_number - a.version_number);
      const target =
        pending[0]?.version_number ??
        detail.active_version ??
        detail.versions[detail.versions.length - 1]?.version_number;
      if (target) {
        let loaded = await api.getVersion(id, target);
        // Herança: se o modelo é filho e o rascunho está vazio, aplica a
        // estrutura/padrão visual do modelo base (o autosave persiste).
        if (detail.parent_model_id && (loaded.config.sections?.length ?? 0) === 0) {
          try {
            const parentDetail = await api.getDocumentModel(detail.parent_model_id);
            const parentTarget =
              parentDetail.active_version ??
              parentDetail.versions[parentDetail.versions.length - 1]?.version_number;
            if (parentTarget) {
              const parentVersion = await api.getVersion(parentDetail.id, parentTarget);
              loaded = {
                ...loaded,
                config: {
                  ...loaded.config,
                  sections: parentVersion.config.sections,
                  fields: loaded.config.fields.length
                    ? loaded.config.fields
                    : parentVersion.config.fields,
                  document_title:
                    loaded.config.document_title || parentVersion.config.document_title,
                  summary: loaded.config.summary || parentVersion.config.summary,
                },
                layout: loaded.layout ?? parentVersion.layout ?? null,
              };
            }
          } catch {
            // Falha ao carregar o pai não impede abrir o filho.
          }
        }
        setVersion(loaded);
      }
    } catch (err) {
      notifyError("document-models.builder", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .getInstitution()
      .then(setInstitution)
      .catch(() => setInstitution(null));
  }, []);

  const createVersion = async () => {
    if (!model || !version) return;
    try {
      const created = await api.createModelVersion(model.id, {
        config: version.config,
        layout: version.layout ?? undefined,
        change_reason: "Nova versão a partir da ativa",
      });
      toast.success(`Versão v${created.version_number} criada (rascunho).`);
      await load();
    } catch (err) {
      notifyError("document-models.new-version", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-gutter py-16 text-body-sm text-on-surface-variant">
        <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" />
        Carregando construtor…
      </div>
    );
  }
  if (!model || !version) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-gutter">
        <div className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest">
          <EmptyState
            title="Modelo não encontrado"
            description="Ele pode ter sido removido ou o endereço está incorreto."
            action={
              <button
                type="button"
                onClick={() => router.push("/documentos/modelos")}
                className="btn btn-outline btn-sm"
              >
                Voltar para modelos
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <DocumentModelBuilder
      model={model}
      version={version}
      institution={institution}
      onRefresh={load}
      onCreateVersion={createVersion}
    />
  );
}
