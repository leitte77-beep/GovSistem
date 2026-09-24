"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import toast from "react-hot-toast";

import { semanticApi } from "@/lib/semanticApi";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
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
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-body-sm font-semibold";
  if (status === "active") return `${base} bg-secondary-container text-on-secondary-container`;
  if (status === "archived") return `${base} bg-surface-container text-outline`;
  return `${base} bg-warning-container text-on-warning-container`;
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
      <div className="mx-auto w-full max-w-container-max animate-fade-up px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Publicação"
          title="Modelos de publicação"
          description="Modelos configuráveis e versionados — rascunho → ativo imutável → arquivado."
          actions={
            <button type="button" onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Plus size={18} aria-hidden="true" /> Novo modelo
            </button>
          }
        />

        {loading ? (
          <div className="overflow-hidden rounded-xl border border-outline-variant" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse border-b border-outline-variant bg-surface-container last:border-0" />
            ))}
            <span className="sr-only">Carregando modelos de publicação…</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
            <EmptyState
              title="Nenhum modelo"
              description="Crie um modelo para estruturar a aparência das matérias."
              action={
                <button type="button" onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
                  <Plus size={16} aria-hidden="true" /> Novo modelo
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <caption className="sr-only">Lista de modelos de publicação</caption>
                <thead className="border-b border-outline-variant bg-surface-container-low text-left">
                  <tr>
                    <th scope="col" className="eyebrow px-4 py-3 font-semibold">Modelo</th>
                    <th scope="col" className="eyebrow px-4 py-3 font-semibold">Tipo</th>
                    <th scope="col" className="eyebrow px-4 py-3 font-semibold">Versão ativa</th>
                    <th scope="col" className="eyebrow px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="eyebrow px-4 py-3 font-semibold">Versões</th>
                    <th scope="col" className="eyebrow px-4 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/70">
                  {templates.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-surface-container-low">
                      <td className="px-4 py-3 font-semibold text-on-surface">{t.name}</td>
                      <td className="px-4 py-3 capitalize text-on-surface-variant">{t.document_type}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{t.active_version ? `v${t.active_version}` : "—"}</td>
                      <td className="px-4 py-3"><span className={statusPill(t.status)}>{STATUS_LABEL[t.status] || t.status}</span></td>
                      <td className="px-4 py-3 text-on-surface-variant">{t.versions.length}</td>
                      <td className="px-4 py-3">
                        <Link href={`/templates/${t.id}`} className="font-medium text-primary hover:underline">Gerenciar</Link>
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
          <div className="absolute inset-0 bg-black/50 animate-fade-in" aria-hidden="true" onClick={() => setShowCreate(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="tpl-title"
            className="relative w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-pop animate-fade-up">
            <div className="flex items-start justify-between gap-3">
              <h2 id="tpl-title" className="text-headline-sm text-on-surface">Novo modelo de publicação</h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setShowCreate(false)}
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <label className="field-label" htmlFor="tpl-name">Nome</label>
                <input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)}
                  className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="tpl-slug">Modelo inicial</label>
                  <select id="tpl-slug" value={slug}
                    onChange={(e) => { setSlug(e.target.value); setDocType(e.target.value); }}
                    className="input capitalize">
                    {SLUGS.map((s) => <option key={s} value={s}>{s.replace("-", " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="tpl-doctype">Tipo de documento</label>
                  <input id="tpl-doctype" value={docType} onChange={(e) => setDocType(e.target.value)}
                    className="input" />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn btn-outline">
                Cancelar
              </button>
              <button type="button" onClick={handleCreate} disabled={creating} className="btn btn-primary">
                {creating ? "Criando…" : "Criar modelo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
