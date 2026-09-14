"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { useEscapeKey } from "@/lib/useEscapeKey";
import PageHeader from "@/components/PageHeader";
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
  draft: "bg-gray-100 text-gray-700",
  in_approval: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  inactive: "bg-orange-100 text-orange-800",
  archived: "bg-gray-200 text-gray-600",
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
        className="inline-flex items-center rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="material-symbols-outlined text-base">more_vert</span>
      </button>
      {menuOpenId === m.id && menuPos && (
        <div
          ref={menuPanelRef}
          role="menu"
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: 208 }}
          className="z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg"
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
          <div className="my-1 border-t border-gray-100" />
          <MenuItem icon="delete" label="Excluir" danger onClick={() => doDelete(m)} />
        </div>
      )}
    </div>
  );

  return (
    <div className="p-gutter max-w-6xl">
      <PageHeader
        title="Modelos documentais"
        description="Crie e aprove modelos visuais dos documentos oficiais. A versão ativa é imutável; alterações criam uma nova versão."
        actions={
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Novo modelo
          </button>
        }
      />

      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">Criar modelo (rascunho)</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Nome</span>
              <input
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value);
                  if (!slugTouched) setCreateSlug(slugify(e.target.value));
                }}
                placeholder="Portaria de Férias"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Slug (único na organização)</span>
              <input
                value={createSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setCreateSlug(slugify(e.target.value));
                }}
                placeholder="portaria-ferias"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Tipo de documento</span>
              <select
                value={createTipo}
                onChange={(e) => setCreateTipo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Finalidade</span>
              <input
                value={createPurpose}
                onChange={(e) => setCreatePurpose(e.target.value)}
                placeholder="Concessão de férias"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-gray-700">
                Modelo base (opcional — herda estrutura e padrão visual)
              </span>
              <select
                value={createBase}
                onChange={(e) => setCreateBase(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
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
          <div className="mt-4 flex gap-2">
            <button
              onClick={doCreate}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Criar e abrir construtor
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
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
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
        <p className="py-10 text-center text-sm text-gray-500">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          Nenhum modelo encontrado. Cadastre um modelo para começar.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Versão</th>
                <th className="px-4 py-3">Uso</th>
                <th className="px-4 py-3">Criado por</th>
                <th className="px-4 py-3">Última alteração</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => router.push(`/documentos/modelos/${m.id}`)}
                      className="font-medium text-gray-900 hover:text-blue-700"
                    >
                      {m.name}
                    </button>
                    <div className="text-xs text-gray-500">{m.purpose}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {TIPO_LABEL[m.document_type] ?? m.document_type}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                    {m.is_default && (
                      <span className="ml-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                        Padrão
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.active_version ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.usage_count > 0
                      ? `${m.usage_count} documento${m.usage_count === 1 ? "" : "s"}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.created_by_name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(m.updated_at)}</td>
                  <td className="px-4 py-3 text-right">{renderActions(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setHistoryFor(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Histórico de ${historyFor.name}`}
            className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Histórico de alterações</h2>
                <p className="text-xs text-gray-500">{historyFor.name}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar histórico"
                onClick={() => setHistoryFor(null)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {historyLoading ? (
                <p className="py-8 text-center text-sm text-gray-500">Carregando…</p>
              ) : historyEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">Sem eventos registrados.</p>
              ) : (
                <ol className="space-y-4">
                  {historyEntries.map((e) => (
                    <li key={e.id} className="border-l-2 border-gray-200 pl-4">
                      <p className="text-sm font-medium text-gray-900">
                        {ACTION_LABEL[e.action] ?? e.action}
                      </p>
                      {e.description && (
                        <p className="mt-0.5 text-sm text-gray-600">{e.description}</p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-500">
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
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
        danger ? "text-red-600" : "text-gray-700"
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}
