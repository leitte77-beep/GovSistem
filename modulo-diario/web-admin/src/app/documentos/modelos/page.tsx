"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import type { DocumentModelDetail, DocumentModelSummary } from "@/types/document_model";

const TIPO_LABEL: Record<string, string> = {
  decreto: "Decreto", portaria: "Portaria", lei: "Lei", edital: "Edital",
  oficio: "Ofício", resolucao: "Resolução", outro: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", in_approval: "Em aprovação", active: "Ativo", archived: "Arquivado",
};

const TIPOS = Object.keys(TIPO_LABEL);

function exampleConfig() {
  return JSON.stringify(
    {
      purpose: "Concessão de férias",
      scope_document_type: "portaria",
      document_title: "PORTARIA DE FÉRIAS",
      summary: "Concede férias ao servidor {{servidor}}.",
      fields: [
        { key: "servidor", label: "Servidor", type: "text", required: true },
        { key: "dias", label: "Dias", type: "integer", required: true },
        { key: "inicio", label: "Início", type: "date", required: true },
      ],
      sections: [
        {
          id: "comando",
          kind: "command",
          text: "RESOLVE:",
        },
        {
          id: "art1",
          kind: "article",
          text: "Conceder ao servidor {{servidor}} {{dias}} dias de férias a contar de {{inicio}}.",
        },
      ],
    },
    null,
    2
  );
}

export default function DocumentModelsPage() {
  const [models, setModels] = useState<DocumentModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [selected, setSelected] = useState<DocumentModelDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createConfig, setCreateConfig] = useState(exampleConfig());
  const [busy, setBusy] = useState(false);

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

  const filtered = models.filter(
    (m) => (!status || m.status === status) && (!tipo || m.document_type === tipo)
  );

  const openDetail = async (id: string) => {
    setSelected(null);
    try {
      const detail = await api.getDocumentModel(id);
      setSelected(detail);
    } catch (err) {
      notifyError("document-models.detail", err);
    }
  };

  const doSubmit = async (model: DocumentModelSummary, version: number) => {
    setBusy(true);
    try {
      await api.submitModelVersion(model.id, version);
      toast.success("Modelo enviado para aprovação.");
      await openDetail(model.id);
    } catch (err) {
      notifyError("document-models.submit", err);
    } finally {
      setBusy(false);
    }
  };

  const doApprove = async (model: DocumentModelSummary, version: number) => {
    setBusy(true);
    try {
      await api.approveModelVersion(model.id, version);
      toast.success(`Versão v${version} aprovada e ativada (imutável).`);
      await openDetail(model.id);
      load();
    } catch (err) {
      notifyError("document-models.approve", err);
    } finally {
      setBusy(false);
    }
  };

  const doArchive = async (model: DocumentModelSummary) => {
    setBusy(true);
    try {
      await api.archiveDocumentModel(model.id);
      toast.success("Modelo arquivado.");
      setSelected(null);
      load();
    } catch (err) {
      notifyError("document-models.archive", err);
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    setBusy(true);
    try {
      const config = JSON.parse(createConfig);
      await api.createDocumentModel({ name: createName, slug: createSlug, config });
      toast.success("Modelo criado (v1 rascunho).");
      setShowCreate(false);
      setCreateName("");
      setCreateSlug("");
      setCreateConfig(exampleConfig());
      load();
    } catch (err) {
      notifyError("document-models.create", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-gutter max-w-6xl">
      <PageHeader
        title="Modelos documentais"
        description="Ensine/aprove os modelos usados na geração de minutas. A versão ativa é imutável; alterações criam uma nova versão."
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
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Portaria de Férias"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Slug (único na organização)</span>
              <input
                value={createSlug}
                onChange={(e) => setCreateSlug(e.target.value)}
                placeholder="portaria-ferias"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">
              Config JSON (campos, seções/textos fixos, condicionais — validado no servidor)
            </span>
            <textarea
              value={createConfig}
              onChange={(e) => setCreateConfig(e.target.value)}
              rows={14}
              spellCheck={false}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              onClick={doCreate}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Criar modelo
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
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>{TIPO_LABEL[t]}</option>
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
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Versão ativa</th>
                <th className="px-4 py-3">Padrão</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => openDetail(m.id)}
                  className={`cursor-pointer border-b border-gray-100 transition hover:bg-blue-50 ${
                    selected?.id === m.id ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-4 py-3 text-gray-600">{TIPO_LABEL[m.document_type] ?? m.document_type}</td>
                  <td className="px-4 py-3">
                    <Badge status={m.status}>{STATUS_LABEL[m.status] ?? m.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.active_version ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{m.is_default ? "Sim" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selected.name}</h3>
              <p className="text-sm text-gray-500">{selected.purpose}</p>
            </div>
            <button
              onClick={() => doArchive(selected)}
              disabled={busy || selected.status === "archived"}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Arquivar
            </button>
          </div>

          <h4 className="mt-5 text-sm font-semibold text-gray-700">Versões</h4>
          <div className="mt-2 space-y-2">
            {selected.versions.map((v) => (
              <div key={v.version_number} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">v{v.version_number}</span>
                  <Badge status={v.status}>{STATUS_LABEL[v.status] ?? v.status}</Badge>
                  {v.change_reason && <span className="text-gray-500">{v.change_reason}</span>}
                </div>
                <div className="flex gap-2">
                  {v.status === "draft" && (
                    <button
                      onClick={() => doSubmit(selected, v.version_number)}
                      disabled={busy}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Enviar p/ aprovação
                    </button>
                  )}
                  {v.status === "in_approval" && (
                    <button
                      onClick={() => doApprove(selected, v.version_number)}
                      disabled={busy}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Aprovar / ativar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ status, children }: { status: string; children: React.ReactNode }) {
  const color: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    in_approval: "bg-amber-100 text-amber-800",
    active: "bg-green-100 text-green-800",
    archived: "bg-gray-200 text-gray-500",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color[status] ?? "bg-gray-100 text-gray-700"}`}>
      {children}
    </span>
  );
}
