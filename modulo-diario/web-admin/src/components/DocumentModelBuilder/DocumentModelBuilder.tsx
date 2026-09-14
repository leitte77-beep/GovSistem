"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type {
  DocumentField,
  DocumentLayout,
  DocumentModelConfig,
  DocumentModelDetail,
  DocumentSection,
  InstitutionalProfile,
  VersionDetail,
} from "@/types/document_model";
import {
  defaultLayout,
  duplicateSectionInTree,
  emptyConfig,
  findSection,
  mapSections,
  moveSection,
  newField,
  removeSection,
  renameFieldRefs,
  reorderSection,
  sectionFromElement,
  stripField,
  type ElementDef,
} from "./constants";
import A4Canvas from "./A4Canvas";
import AdvancedConfigDrawer from "./AdvancedConfigDrawer";
import BlocksDrawer from "./BlocksDrawer";
import ElementsPanel from "./ElementsPanel";
import PreviewModal from "./PreviewModal";
import PropertiesPanel from "./PropertiesPanel";
import TrainingFilesDrawer from "./TrainingFilesDrawer";

interface Props {
  model: DocumentModelDetail;
  version: VersionDetail;
  institution?: InstitutionalProfile | null;
  onRefresh: () => void;
  onCreateVersion?: () => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  in_approval: "Em aprovação",
  active: "Ativo",
  inactive: "Inativo",
  archived: "Arquivado",
};

export default function DocumentModelBuilder({
  model,
  version,
  institution,
  onRefresh,
  onCreateVersion,
}: Props) {
  const { user } = useAuth();
  const canAdvanced = Boolean(
    user?.roles?.some((r) => r.name === "ADMIN" || r.name === "SUPER_ADMIN")
  );
  const canTrain = Boolean(
    user?.roles?.some((r) =>
      ["ADMIN", "SUPER_ADMIN", "AUTOR"].includes(r.name)
    )
  );
  const canManageBlocks = canTrain;
  const readOnly = version.status !== "draft";

  const [config, setConfig] = useState<DocumentModelConfig>(
    () => ({ ...emptyConfig(), ...(version.config as DocumentModelConfig) })
  );
  const [layout, setLayout] = useState<DocumentLayout>(
    () => ({ ...defaultLayout(), ...(version.layout ?? {}) })
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState<DocumentSection[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset ao trocar de versão.
  useEffect(() => {
    setConfig({ ...emptyConfig(), ...(version.config as DocumentModelConfig) });
    setLayout({ ...defaultLayout(), ...(version.layout ?? {}) });
    setSelectedSectionId(null);
    setSelectedFieldKey(null);
    setSaveState("idle");
    mounted.current = false;
  }, [version.version_number]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave (somente rascunho).
  useEffect(() => {
    if (readOnly) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaveState("saving");
    pendingSave.current = setTimeout(async () => {
      pendingSave.current = null;
      try {
        await api.updateModelVersion(model.id, version.version_number, {
          config,
          layout,
        });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1200);
    return () => {
      if (pendingSave.current) {
        clearTimeout(pendingSave.current);
        pendingSave.current = null;
      }
    };
  }, [config, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persiste imediatamente as alterações pendentes do autosave. Usado antes de
  // enviar para aprovação, para não perder edições feitas nos últimos 1,2s.
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (readOnly) return true;
    if (pendingSave.current) {
      clearTimeout(pendingSave.current);
      pendingSave.current = null;
    }
    try {
      await api.updateModelVersion(model.id, version.version_number, {
        config,
        layout,
      });
      setSaveState("saved");
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  }, [config, layout, model.id, version.version_number, readOnly]);

  const addElement = (def: ElementDef) => {
    const section = sectionFromElement(def);
    setConfig((c) => ({ ...c, sections: [...c.sections, section] }));
    setSelectedFieldKey(null);
    setSelectedSectionId(section.id);
  };

  const addChildElement = (parentId: string, def: ElementDef) => {
    setConfig((c) => {
      const parent = findSection(c.sections, parentId);
      if (!parent) return c;
      const child = sectionFromElement(def);
      return {
        ...c,
        sections: mapSections(c.sections, parentId, {
          children: [...(parent.children ?? []), child],
        }),
      };
    });
  };

  const updateSection = useCallback((id: string, patch: Partial<DocumentSection>) => {
    setConfig((c) => ({ ...c, sections: mapSections(c.sections, id, patch) }));
  }, []);

  const deleteSection = (id: string) => {
    setConfig((c) => ({ ...c, sections: removeSection(c.sections, id) }));
    setSelectedSectionId((cur) => (cur === id ? null : cur));
  };

  const handleAction = (id: string, action: "up" | "down" | "duplicate" | "delete") => {
    if (action === "delete") return deleteSection(id);
    if (action === "up") return setConfig((c) => ({ ...c, sections: moveSection(c.sections, id, -1) }));
    if (action === "down") return setConfig((c) => ({ ...c, sections: moveSection(c.sections, id, 1) }));
    return setConfig((c) => ({ ...c, sections: duplicateSectionInTree(c.sections, id) }));
  };

  const addField = () => {
    const field = newField(config.fields.length + 1);
    setConfig((c) => ({ ...c, fields: [...c.fields, field] }));
    setSelectedSectionId(null);
    setSelectedFieldKey(field.key);
  };

  const deleteField = (key: string) => {
    setConfig((c) => stripField(c, key));
    setSelectedFieldKey((cur) => (cur === key ? null : cur));
  };

  const updateField = (key: string, patch: Partial<DocumentField>) => {
    setConfig((c) => {
      let next = c;
      if (patch.key && patch.key !== key) next = renameFieldRefs(next, key, patch.key);
      return {
        ...next,
        fields: next.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
      };
    });
    if (patch.key && patch.key !== key) setSelectedFieldKey(patch.key);
  };

  const insertField = (key: string) => {
    if (!selectedSectionId) {
      toast.error("Selecione um elemento de texto para inserir o campo.");
      return;
    }
    setConfig((c) => {
      const section = findSection(c.sections, selectedSectionId);
      if (!section || section.kind === "signature_block") {
        toast.error("Selecione um elemento de texto (parágrafo, artigo, título…).");
        return c;
      }
      const text = `${section.text ?? ""}{{${key}}}`;
      return { ...c, sections: mapSections(c.sections, selectedSectionId, { text }) };
    });
  };

  const openBlocks = () => {
    setBlockDraft(undefined);
    setBlocksOpen(true);
  };

  const saveSelectionAsBlock = () => {
    if (!selectedSectionId) {
      toast.error("Selecione um elemento no documento primeiro.");
      return;
    }
    const section = findSection(config.sections, selectedSectionId);
    if (!section) return;
    setBlockDraft([section]);
    setBlocksOpen(true);
  };

  const insertBlockSections = (sections: DocumentSection[]) => {
    setConfig((c) => ({ ...c, sections: [...c.sections, ...sections] }));
    setBlocksOpen(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const saved = await flushSave();
      if (!saved) {
        throw new Error("Não foi possível salvar as alterações antes de enviar.");
      }
      await api.submitModelVersion(model.id, version.version_number);
      toast.success("Enviado para aprovação.");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar.");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await api.approveModelVersion(model.id, version.version_number);
      toast.success("Versão aprovada e ativada (imutável).");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao aprovar.");
    } finally {
      setBusy(false);
    }
  };

  const saveLabel =
    saveState === "saving"
      ? "Salvando…"
      : saveState === "saved"
        ? "Salvo"
        : saveState === "error"
          ? "Erro ao salvar"
          : readOnly
            ? "Somente leitura"
            : "Alterações salvas automaticamente";

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-gray-900">{model.name}</h1>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              v{version.version_number} · {STATUS_LABEL[version.status] ?? version.status}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                saveState === "error"
                  ? "bg-red-500"
                  : saveState === "saving"
                    ? "bg-amber-400"
                    : "bg-green-500"
              }`}
            />
            {saveLabel}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            Testar / Pré-visualizar
          </button>
          {canAdvanced && (
            <button
              type="button"
              onClick={() => setAdvancedOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-[18px]">code</span>
              Configurações avançadas
            </button>
          )}
          {canTrain && (
            <button
              type="button"
              onClick={() => setTrainingOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-[18px]">school</span>
              Aprender com documentos
            </button>
          )}
          {readOnly ? (
            onCreateVersion && (
              <button
                type="button"
                onClick={onCreateVersion}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Criar nova versão
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Enviar p/ aprovação
            </button>
          )}
          {version.status === "in_approval" && (
            <button
              type="button"
              onClick={approve}
              disabled={busy}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Aprovar / ativar
            </button>
          )}
        </div>
      </div>

      {/* 3 painéis */}
      <div className="flex min-h-0 flex-1">
        <ElementsPanel
          config={config}
          selectedSectionId={selectedSectionId}
          selectedFieldKey={selectedFieldKey}
          readOnly={readOnly}
          onAddElement={addElement}
          onAddChildElement={addChildElement}
          onAddField={addField}
          onSelectField={(k) => {
            setSelectedSectionId(null);
            setSelectedFieldKey(k);
          }}
          onDeleteField={deleteField}
          onInsertField={insertField}
          onOpenBlocks={openBlocks}
          onSaveSelectionAsBlock={saveSelectionAsBlock}
          canManageBlocks={canManageBlocks}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <A4Canvas
            config={config}
            layout={layout}
            institution={institution}
            selectedId={selectedSectionId}
            readOnly={readOnly}
            onSelect={(id) => {
              setSelectedFieldKey(null);
              setSelectedSectionId(id || null);
            }}
            onAction={handleAction}
            onReorder={(dragId, targetId) =>
              setConfig((c) => ({
                ...c,
                sections: reorderSection(c.sections, dragId, targetId),
              }))
            }
          />
        </main>
        <PropertiesPanel
          config={config}
          layout={layout}
          selectedSectionId={selectedSectionId}
          selectedFieldKey={selectedFieldKey}
          readOnly={readOnly}
          onUpdateConfig={(patch) => setConfig((c) => ({ ...c, ...patch }))}
          onUpdateLayout={(patch) => setLayout((l) => ({ ...l, ...patch }))}
          onUpdateSection={(id, patch) => updateSection(id, patch)}
          onUpdateField={updateField}
          onDeleteSection={deleteSection}
        />
      </div>

      <AdvancedConfigDrawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        config={config}
        layout={layout}
      />
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        modelId={model.id}
        version={version.version_number}
        fields={config.fields}
      />
      <TrainingFilesDrawer
        open={trainingOpen}
        onClose={() => setTrainingOpen(false)}
        modelId={model.id}
        canTrain={canTrain}
        onApplied={onRefresh}
      />
      <BlocksDrawer
        open={blocksOpen}
        onClose={() => setBlocksOpen(false)}
        draftSections={blockDraft}
        canManage={canManageBlocks}
        onInsertSections={insertBlockSections}
      />
    </div>
  );
}
