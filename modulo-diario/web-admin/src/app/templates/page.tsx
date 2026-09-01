"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";

import { semanticApi } from "@/lib/semanticApi";
import { notifyError } from "@/lib/error-handler";
import type { Template } from "@/types/semantic";

const SLUGS = [
  "decreto", "portaria", "lei", "resolucao", "edital", "licitacao",
  "ata", "contrato", "relatorio-contabil", "outro", "pdf-original",
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

function statusPill(status: string) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (status === "active") return `${base} bg-green-100 text-green-700`;
  if (status === "archived") return `${base} bg-gray-100 text-gray-600`;
  return `${base} bg-amber-100 text-amber-700`;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("decreto");
  const [docType, setDocType] = useState("decreto");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    semanticApi.listTemplates()
      .then(setTemplates)
      .catch((err) => notifyError("Templates.listTemplates", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Informe o nome do modelo"); return; }
    setCreating(true);
    try {
      await semanticApi.createTemplate({ name: name.trim(), slug, document_type: docType });
      toast.success("Modelo criado");
      setShowCreate(false);
      setName("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar modelo");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="overflow-y-auto custom-scrollbar" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="p-gutter">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Modelos de Publicação</h1>
            <p className="mt-1 text-sm text-gray-600">
              Modelos configuráveis e versionados (rascunho → ativo imutável → arquivado)
            </p>
          </div>
          <button type="button" onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            <span className="material-symbols-outlined text-[18px]">add</span> Novo modelo
          </button>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-300">dashboard_customize</span>
            <p className="text-base font-semibold text-gray-800">Nenhum modelo</p>
            <p className="max-w-md text-sm text-gray-600">Crie um modelo para estruturar a aparência das matérias.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Lista de modelos de publicação</caption>
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th scope="col" className="px-4 py-3">Modelo</th>
                    <th scope="col" className="px-4 py-3">Tipo</th>
                    <th scope="col" className="px-4 py-3">Versão ativa</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Versões</th>
                    <th scope="col" className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">{t.name}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">{t.document_type}</td>
                      <td className="px-4 py-3 text-gray-600">{t.active_version ? `v${t.active_version}` : "—"}</td>
                      <td className="px-4 py-3"><span className={statusPill(t.status)}>{STATUS_LABEL[t.status] || t.status}</span></td>
                      <td className="px-4 py-3 text-gray-600">{t.versions.length}</td>
                      <td className="px-4 py-3">
                        <Link href={`/templates/${t.id}`} className="font-medium text-blue-700 hover:underline">Gerenciar</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={() => setShowCreate(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="tpl-title"
            className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 id="tpl-title" className="text-lg font-semibold text-gray-900">Novo modelo de publicação</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="tpl-name">Nome</label>
                <input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="tpl-slug">Modelo inicial</label>
                  <select id="tpl-slug" value={slug}
                    onChange={(e) => { setSlug(e.target.value); setDocType(e.target.value); }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 capitalize">
                    {SLUGS.map((s) => <option key={s} value={s}>{s.replace("-", " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="tpl-doctype">Tipo de documento</label>
                  <input id="tpl-doctype" value={docType} onChange={(e) => setDocType(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button type="button" onClick={handleCreate} disabled={creating}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {creating ? "Criando…" : "Criar modelo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
