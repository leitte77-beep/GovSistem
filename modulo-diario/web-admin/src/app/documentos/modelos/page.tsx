"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { useEscapeKey } from "@/lib/useEscapeKey";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import PreviewModal from "@/components/DocumentModelBuilder/PreviewModal";
import type {
  DocumentField,
  DocumentModelHistoryEntry,
  DocumentModelSummary,
} from "@/types/document_model";
import { TIPO_LABEL, TIPOS, emptyConfig, slugify } from "@/components/DocumentModelBuilder/constants";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  in_approval: "Em aprovação",
  active: "Ativo",
  inactive: "Inativo",
  archived: "Arquivado",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-surface-container text-on-surface-variant",
  in_approval: "bg-warning-container text-on-warning-container",
  active: "bg-secondary-container text-on-secondary-container",
  inactive: "bg-surface-container-high text-on-surface-variant",
  archived: "bg-surface-container text-outline",
};

const ACTION_LABEL: Record<string, string> = {
  "document_model.created": "Modelo criado",
  "document_model.updated": "Rascunho atualizado",
  "document_model.versioned": "Nova versão",
  "document_model.submitted": "Enviado para aprovação",
  "document_model.approved": "Aprovado/ativado",
  "document_model.archived": "Arquivado",
  "document_model.deactivated": "Desativado",
  "document_model.activated": "Reativado",
  "document_model.deleted": "Excluído",
  "document_model.material.created": "Minuta gerada",
};

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PreviewTarget {
  modelId: string;
  version: number;
  fields: DocumentField[];
  name: string;
}

export default function DocumentModelsPage() {
  const router = useRouter();
  const [models, setModels] = useState<DocumentModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [createTipo, setCreateTipo] = useState("portaria");
  const [createPurpose, setCreatePurpose] = useState("");
  const [createBase, setCreateBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [historyFor, setHistoryFor] = useState<DocumentModelSummary | null>(null);
  const [historyEntries, setHistoryEntries] = useState<DocumentModelHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listDocumentModels()
      .then(setModels)
      .catch((err) => notifyError("document-models.list", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closeMenu = useCallback(() => {
    setMenuOpenId(null);
    setMenuPos(null);
  }, []);

  useEffect(() => {
    if (!menuOpenId) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || menuPanelRef.current?.contains(target)) return;
      closeMenu();
    };
    const onReflow = () => closeMenu();
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [menuOpenId, closeMenu]);

  useEscapeKey(Boolean(menuOpenId), closeMenu);
  useEscapeKey(Boolean(historyFor), () => setHistoryFor(null));

  const filtered = models.filter(
    (m) => (!status || m.status === status) && (!tipo || m.document_type === tipo)
  );

  const doCreate = async () => {
    setBusy(true);
    try {
      const name = createName.trim();
      const slug = slugify(createSlug);
      if (!name) throw new Error("Informe o nome do modelo.");
      if (!slug) throw new Error("Informe um slug válido (letras minúsculas, números e hífen).");
      const config = emptyConfig(createPurpose.trim() || name);
      config.scope_document_type = createTipo;
      const created = await api.createDocumentModel({
        name,
        slug,
        config,
        parent_model_id: createBase || null,
      });
      toast.success("Modelo criado (v1 rascunho).");
      router.push(`/documentos/modelos/${created.id}`);
    } catch (err) {
      notifyError("document-models.create", err);
    } finally {
      setBusy(false);
    }
  };

  const doArchive = async (model: DocumentModelSummary) => {
    if (!window.confirm(`Arquivar o modelo "${model.name}"? Ele deixa de ser usado para geração.`))
      return;
    setBusy(true);
    try {
      await api.archiveDocumentModel(model.id);
      toast.success("Modelo arquivado.");
      load();
    } catch (err) {
      notifyError("document-models.archive", err);
    } finally {
      setBusy(false);
      setMenuOpenId(null);
    }
  };

  const doToggleActive = async (model: DocumentModelSummary) => {
    setBusy(true);
    try {
      if (model.status === "active") {
        await api.deactivateDocumentModel(model.id);
        toast.success("Modelo desativado.");
      } else {
        await api.reactivateDocumentModel(model.id);
        toast.success("Modelo reativado.");
      }
      load();
    } catch (err) {
      notifyError("document-models.toggle", err);
    } finally {
      setBusy(false);
      setMenuOpenId(null);
    }
  };

  const doDuplicate = async (model: DocumentModelSummary) => {
    setBusy(true);
    try {
      const created = await api.duplicateDocumentModel(model.id, {});
      toast.success("Modelo duplicado (v1 rascunho).");
      router.push(`/documentos/modelos/${created.id}`);
    } catch (err) {
      notifyError("document-models.duplicate", err);
    } finally {
      setBusy(false);
      setMenuOpenId(null);
    }
  };

  const doDelete = async (model: DocumentModelSummary) => {
    if (
      !window.confirm(
        `Excluir o modelo "${model.name}"? Ele deixará de aparecer nas listagens (soft delete).`
      )
    )
      return;
    setBusy(true);
    try {
      await api.deleteDocumentModel(model.id);
      toast.success("Modelo excluído.");
      load();
    } catch (err) {
      notifyError("document-models.delete", err);
    } finally {
      setBusy(false);
      setMenuOpenId(null);
    }
  };

  const openHistory = async (model: DocumentModelSummary) => {
    setMenuOpenId(null);
    setHistoryFor(model);
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      setHistoryEntries(await api.getDocumentModelHistory(model.id));
    } catch (err) {
      notifyError("document-models.history", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openPreview = async (model: DocumentModelSummary) => {
    setMenuOpenId(null);
    setBusy(true);
    try {
      const detail = await api.getDocumentModel(model.id);
      const drafts = detail.versions
        .filter((v) => v.status === "draft")
        .sort((a, b) => b.version_number - a.version_number);
      const target =
        detail.active_version ??
        drafts[0]?.version_number ??
        detail.versions[detail.versions.length - 1]?.version_number;
      if (!target) throw new Error("Este modelo ainda não possui versões para pré-visualizar.");
      const version = await api.getVersion(model.id, target);
      setPreview({
        modelId: model.id,
        version: target,
        fields: version.config.fields,
        name: model.name,
      });
    } catch (err) {
      notifyError("document-models.preview", err);
    } finally {
      setBusy(false);
    }
  };

  const toggleMenu = (m: DocumentModelSummary, button: HTMLElement) => {
    if (menuOpenId === m.id) {
      closeMenu();
      return;
    }
    const rect = button.getBoundingClientRect();
    const width = 208;
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(rect.right - width, window.innerWidth - width - margin)
    );
    const estimatedHeight = 320;
    const below = rect.bottom + 4;
    const top =
      below + estimatedHeight > window.innerHeight
        ? Math.max(margin, rect.top - estimatedHeight - 4)
        : below;
    setMenuOpenId(m.id);
    setMenuPos({ top, left });
  };

  const renderActions = (m: DocumentModelSummary) => (
    <div className="relative" ref={menuOpenId === m.id ? menuRef : undefined}>
      <button
        type="button"
        aria-label={`Ações do modelo ${m.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpenId === m.id}
        onClick={(e) => toggleMenu(m, e.currentTarget)}
        className="inline-flex items-center rounded-lg border border-outline-variant p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span className="material-symbols-outlined text-base">more_vert</span>
      </button>
      {menuOpenId === m.id && menuPos && (
        <div
          ref={menuPanelRef}
          role="menu"
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: 208 }}
          className="z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest py-1 text-left shadow-pop animate-fade-in"
        >
          <MenuItem icon="edit" label="Editar" onClick={() => router.push(`/documentos/modelos/${m.id}`)} />
          <MenuItem icon="visibility" label="Pré-visualizar / Testar" onClick={() => openPreview(m)} />
          <MenuItem icon="history" label="Histórico" onClick={() => openHistory(m)} />
          <MenuItem icon="content_copy" label="Duplicar" onClick={() => doDuplicate(m)} />
          {m.status === "active" && (
            <MenuItem
              icon="toggle_off"
              label="Desativar"
              onClick={() => doToggleActive(m)}
            />
          )}
          {m.status === "inactive" && (
            <MenuItem icon="toggle_on" label="Reativar" onClick={() => doToggleActive(m)} />
          )}
          {m.status !== "archived" && (
            <MenuItem icon="archive" label="Arquivar" onClick={() => doArchive(m)} />
          )}
          <div className="my-1 border-t border-outline-variant" />
          <MenuItem icon="delete" label="Excluir" danger onClick={() => doDelete(m)} />
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-container-max animate-fade-up px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Conteúdo institucional"
        title="Modelos documentais"
        description="Crie e aprove modelos visuais dos documentos oficiais. A versão ativa é imutável; alterações criam uma nova versão."
        actions={
          <button onClick={() => setShowCreate((v) => !v)} className="btn btn-primary">
            <Plus size={18} aria-hidden="true" />
            Novo modelo
          </button>
        }
      />

      {showCreate && (
        <div className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 animate-fade-in">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-headline-sm text-on-surface">Criar modelo (rascunho)</h3>
              <p className="field-hint mt-0.5">Defina o essencial agora; o construtor abre em seguida.</p>
            </div>
            <button
              type="button"
              aria-label="Fechar formulário"
              onClick={() => setShowCreate(false)}
              className="inline-flex items-center justify-center rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Nome</span>
              <input
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value);
                  if (!slugTouched) setCreateSlug(slugify(e.target.value));
                }}
                placeholder="Portaria de Férias"
                className="input"
              />
            </label>
            <label className="block">
              <span className="field-label">Slug (único na organização)</span>
              <input
                value={createSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setCreateSlug(slugify(e.target.value));
                }}
                placeholder="portaria-ferias"
                className="input"
              />
            </label>
            <label className="block">
              <span className="field-label">Tipo de documento</span>
              <select value={createTipo} onChange={(e) => setCreateTipo(e.target.value)} className="input">
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Finalidade</span>
              <input
                value={createPurpose}
                onChange={(e) => setCreatePurpose(e.target.value)}
                placeholder="Concessão de férias"
                className="input"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">
                Modelo base (opcional — herda estrutura e padrão visual)
              </span>
              <select value={createBase} onChange={(e) => setCreateBase(e.target.value)} className="input">
                <option value="">Sem herança (começar do zero)</option>
                {models
                  .filter((m) => m.status !== "archived")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {TIPO_LABEL[m.document_type] ?? m.document_type}
                      {m.active_version ? ` (v${m.active_version})` : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={doCreate} disabled={busy} className="btn btn-primary">
              Criar e abrir construtor
            </button>
            <button onClick={() => setShowCreate(false)} className="btn btn-outline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar por estado"
          className="input w-full sm:w-56"
        >
          <option value="">Todos os estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          aria-label="Filtrar por tipo"
          className="input w-full sm:w-56"
        >
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-outline-variant" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse border-b border-outline-variant bg-surface-container last:border-0" />
          ))}
          <span className="sr-only">Carregando…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
          <EmptyState
            title="Nenhum modelo encontrado"
            description="Ajuste os filtros ou cadastre um modelo documental para começar."
            action={
              <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
                <Plus size={16} aria-hidden="true" />
                Novo modelo
              </button>
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
          <table className="min-w-full text-body-sm">
            <thead className="border-b border-outline-variant bg-surface-container-low text-left">
              <tr>
                <th className="eyebrow px-4 py-3 font-semibold">Nome</th>
                <th className="eyebrow px-4 py-3 font-semibold">Tipo</th>
                <th className="eyebrow px-4 py-3 font-semibold">Estado</th>
                <th className="eyebrow px-4 py-3 font-semibold">Versão</th>
                <th className="eyebrow px-4 py-3 font-semibold">Uso</th>
                <th className="eyebrow px-4 py-3 font-semibold">Criado por</th>
                <th className="eyebrow px-4 py-3 font-semibold">Última alteração</th>
                <th className="eyebrow px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/70">
              {filtered.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-surface-container-low">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => router.push(`/documentos/modelos/${m.id}`)}
                      className="font-semibold text-on-surface hover:text-primary"
                    >
                      {m.name}
                    </button>
                    <div className="text-body-sm text-on-surface-variant">{m.purpose}</div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {TIPO_LABEL[m.document_type] ?? m.document_type}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-body-sm font-medium ${
                        STATUS_STYLE[m.status] ?? "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                    {m.is_default && (
                      <span className="ml-1 inline-flex rounded-full bg-primary-fixed px-2 py-0.5 text-body-sm font-semibold text-on-primary-fixed">
                        Padrão
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.active_version ?? "—"}</td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {m.usage_count > 0
                      ? `${m.usage_count} documento${m.usage_count === 1 ? "" : "s"}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.created_by_name ?? "—"}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{fmtDate(m.updated_at)}</td>
                  <td className="px-4 py-3 text-right">{renderActions(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40 animate-fade-in" onClick={() => setHistoryFor(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Histórico de ${historyFor.name}`}
            className="flex h-full w-full max-w-md flex-col bg-surface-container-lowest shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <div>
                <h2 className="text-headline-sm text-on-surface">Histórico de alterações</h2>
                <p className="text-body-sm text-on-surface-variant">{historyFor.name}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar histórico"
                onClick={() => setHistoryFor(null)}
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {historyLoading ? (
                <p className="py-8 text-center text-body-sm text-on-surface-variant">Carregando…</p>
              ) : historyEntries.length === 0 ? (
                <p className="py-8 text-center text-body-sm text-on-surface-variant">Sem eventos registrados.</p>
              ) : (
                <ol className="space-y-4">
                  {historyEntries.map((e) => (
                    <li key={e.id} className="border-l-2 border-outline-variant pl-4">
                      <p className="text-body-md font-semibold text-on-surface">
                        {ACTION_LABEL[e.action] ?? e.action}
                      </p>
                      {e.description && (
                        <p className="mt-0.5 text-body-sm text-on-surface-variant">{e.description}</p>
                      )}
                      <p className="mt-0.5 text-body-sm text-outline">
                        {e.user_name ?? "Sistema"} · {fmtDate(e.created_at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      )}

      {preview && (
        <PreviewModal
          open
          onClose={() => setPreview(null)}
          modelId={preview.modelId}
          version={preview.version}
          fields={preview.fields}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm transition-colors hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 ${
        danger ? "text-error" : "text-on-surface"
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}
