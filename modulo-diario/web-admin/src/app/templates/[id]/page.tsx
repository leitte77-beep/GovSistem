"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

import { semanticApi } from "@/lib/semanticApi";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import Breadcrumbs from "@/components/Breadcrumbs";
import EmptyState from "@/components/EmptyState";
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

function statusPill(status: string) {
  if (status === "active") return "bg-secondary-container text-on-secondary-container";
  if (status === "archived") return "bg-surface-container text-outline";
  return "bg-warning-container text-on-warning-container";
}

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
      <div className="flex min-h-screen items-center justify-center gap-2 text-body-sm text-on-surface-variant">
        <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" />
        Carregando…
      </div>
    );
  }

  if (!tpl) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-gutter">
        <div className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest">
          <EmptyState
            title="Modelo não encontrado"
            description="Ele pode ter sido removido ou o endereço está incorreto."
            action={
              <Link href="/templates" className="btn btn-outline btn-sm">
                Voltar para modelos
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto custom-scrollbar" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="mx-auto w-full max-w-4xl animate-fade-up px-4 py-6 sm:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Modelos", href: "/templates" },
            { label: tpl.name },
          ]}
        />

        <PageHeader
          eyebrow="Modelo de publicação"
          title={tpl.name}
          meta={
            <p className="text-body-sm capitalize text-on-surface-variant">
              {tpl.document_type} · slug “{tpl.slug}” · versão ativa{" "}
              {tpl.active_version ? `v${tpl.active_version}` : "—"}
            </p>
          }
          actions={
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-body-sm font-semibold ${statusPill(tpl.status)}`}>
              {STATUS_LABEL[tpl.status] || tpl.status}
            </span>
          }
        />

        <section className="card mb-6" aria-labelledby="versoes-title">
          <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
            <h2 id="versoes-title" className="text-headline-sm text-on-surface">
              Versões ({tpl.versions.length})
            </h2>
          </div>
          <ul className="divide-y divide-outline-variant/70">
            {tpl.versions.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-on-surface">v{v.version_number}</p>
                  <p className="text-body-sm text-on-surface-variant">
                    {v.change_reason || "Sem motivo registrado"} ·{" "}
                    {v.status === "active" ? "ativa" : "rascunho"} ·{" "}
                    hash <span className="font-mono">{v.config_hash.slice(0, 10)}…</span>
                  </p>
                </div>
                {v.status !== "active" && (
                  <button type="button" onClick={() => handleActivate(v.version_number)} disabled={busy}
                    className="btn btn-primary btn-sm shrink-0">
                    Ativar v{v.version_number}
                  </button>
                )}
              </li>
            ))}
            {tpl.versions.length === 0 && (
              <li className="px-5 py-4 text-body-sm text-on-surface-variant">Nenhuma versão.</li>
            )}
          </ul>
        </section>

        <section className="card" aria-labelledby="nova-versao-title">
          <div className="border-b border-outline-variant px-5 py-4">
            <h2 id="nova-versao-title" className="text-headline-sm text-on-surface">
              Nova versão (configuração JSON)
            </h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              Tokens permitidos validados no backend — sem JS/Jinja/CSS irrestrito. Ao ativar, a versão fica imutável.
            </p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <details className="rounded-lg border border-outline-variant p-3">
              <summary className="cursor-pointer text-body-sm font-semibold text-on-surface-variant">
                Tokens permitidos (allow-list)
              </summary>
              <div className="mt-2 flex flex-wrap gap-1">
                {TOKEN_HINTS.map((t) => (
                  <span key={t} className="rounded bg-surface-container px-2 py-0.5 font-mono text-body-sm text-on-surface-variant">{t}</span>
                ))}
              </div>
            </details>

            <div>
              <label className="field-label" htmlFor="cfg-json">Configuração</label>
              <textarea id="cfg-json" value={configJson} onChange={(e) => setConfigJson(e.target.value)}
                spellCheck={false}
                className="input h-64 resize-y bg-surface-container-low p-3 font-mono text-body-sm"
                placeholder={JSON.stringify({
                  tokens: { "page.margin.top": "20mm", "typography.body.size": "11pt" },
                  allowed_blocks: ["heading", "preamble", "command", "article", "paragraph", "table", "signature_block"],
                  required_sections: ["command", "signature_block"],
                  recommended_order: ["heading", "preamble", "command", "article", "signature_block"],
                }, null, 2)}
              />
              {parseError && <p className="mt-1 text-body-sm text-error">{parseError}</p>}
            </div>
            <div>
              <label className="field-label" htmlFor="cfg-reason">Motivo da alteração</label>
              <input id="cfg-reason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
                className="input" placeholder="Ex.: ajuste de margem para A4" />
            </div>
            <button type="button" onClick={handleNewVersion} disabled={busy} className="btn btn-primary">
              {busy ? "Salvando…" : "Criar versão rascunho"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
