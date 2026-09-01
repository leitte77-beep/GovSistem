"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

import { semanticApi } from "@/lib/semanticApi";
import { notifyError } from "@/lib/error-handler";
import type { Template, TemplateConfig } from "@/types/semantic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const TOKEN_HINTS = [
  "page.size",
  "page.margin.top",
  "page.margin.right",
  "page.margin.bottom",
  "page.margin.left",
  "typography.body.family",
  "typography.body.size",
  "typography.title.size",
  "typography.command.alignment",
  "blocks.preamble.alignment",
  "blocks.command.alignment",
  "blocks.article.indent",
  "blocks.paragraph.indent",
  "tables.border.width",
  "tables.repeat_header",
  "signature.alignment",
  "signature.name.weight",
  "header.text",
  "footer.text",
  "page.numbering",
  "summary.show",
  "validation_block.show",
];

export default function TemplateDetailPage() {
  const params = useParams();
  const templateId = String(params.id);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [configJson, setConfigJson] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    semanticApi.listTemplates()
      .then((list) => {
        const found = list.find((t) => t.id === templateId);
        setTpl(found || null);
      })
      .catch((err) => notifyError("TemplateDetail.load", err))
      .finally(() => setLoading(false));
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  const parseConfig = (): TemplateConfig | null => {
    try {
      const obj = JSON.parse(configJson);
      if (!obj || typeof obj !== "object") throw new Error("JSON inválido");
      return obj as TemplateConfig;
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "JSON inválido");
      return null;
    }
  };

  const handleNewVersion = async () => {
    setParseError("");
    const config = parseConfig();
    if (!config) return;
    setBusy(true);
    try {
      const updated = await semanticApi.createTemplateVersion(templateId, {
        config,
        change_reason: changeReason || null,
      });
      setTpl(updated);
      toast.success("Nova versão criada");
      setChangeReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar versão");
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (versionNumber: number) => {
    setBusy(true);
    try {
      const updated = await semanticApi.activateTemplateVersion(templateId, {
        version_number: versionNumber,
        reason: "Ativação manual",
      });
      setTpl(updated);
      toast.success(`Versão v${versionNumber} ativada`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ativar versão");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
      </div>
    );
  }

  if (!tpl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-gray-800">Modelo não encontrado</p>
        <Link href="/templates" className="text-blue-700 hover:underline">← Voltar para modelos</Link>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto custom-scrollbar" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="p-gutter max-w-5xl mx-auto">
        <Link href="/templates" className="text-sm text-blue-700 hover:underline">← Modelos</Link>

        <header className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{tpl.name}</h1>
            <p className="text-sm text-gray-600 capitalize">
              {tpl.document_type} · slug “{tpl.slug}” · versão ativa{" "}
              {tpl.active_version ? `v${tpl.active_version}` : "—"}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tpl.status === "active" ? "bg-green-100 text-green-700" : tpl.status === "archived" ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-700"}`}>
            {STATUS_LABEL[tpl.status] || tpl.status}
          </span>
        </header>

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Versões ({tpl.versions.length})</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {tpl.versions.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">v{v.version_number}</p>
                  <p className="text-xs text-gray-500">
                    {v.change_reason || "Sem motivo registrado"} ·{" "}
                    {v.status === "active" ? "ativa" : "rascunho"} ·{" "}
                    hash {v.config_hash.slice(0, 10)}…
                  </p>
                </div>
                {v.status !== "active" && (
                  <button type="button" onClick={() => handleActivate(v.version_number)} disabled={busy}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    Ativar v{v.version_number}
                  </button>
                )}
              </li>
            ))}
            {tpl.versions.length === 0 && (
              <li className="px-5 py-4 text-sm text-gray-500">Nenhuma versão.</li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Nova versão (configuração JSON)</h2>
            <p className="text-xs text-gray-500">
              Tokens permitidos validados no backend — sem JS/Jinja/CSS irrestrito. Ao ativar, a versão fica imutável.
            </p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <details className="rounded-lg border border-gray-200 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-gray-600">Tokens permitidos (allow-list)</summary>
              <div className="mt-2 flex flex-wrap gap-1">
                {TOKEN_HINTS.map((t) => (
                  <span key={t} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-600">{t}</span>
                ))}
              </div>
            </details>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="cfg-json">Configuração</label>
              <textarea id="cfg-json" value={configJson} onChange={(e) => setConfigJson(e.target.value)}
                spellCheck={false}
                className="h-64 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs"
                placeholder={JSON.stringify({
                  tokens: { "page.margin.top": "20mm", "typography.body.size": "11pt" },
                  allowed_blocks: ["heading", "preamble", "command", "article", "paragraph", "table", "signature_block"],
                  required_sections: ["command", "signature_block"],
                  recommended_order: ["heading", "preamble", "command", "article", "signature_block"],
                }, null, 2)}
              />
              {parseError && <p className="mt-1 text-xs text-red-600">{parseError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="cfg-reason">Motivo da alteração</label>
              <input id="cfg-reason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" placeholder="Ex.: ajuste de margem para A4" />
            </div>
            <button type="button" onClick={handleNewVersion} disabled={busy}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Salvando…" : "Criar versão rascunho"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
