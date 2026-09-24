"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import Breadcrumbs from "@/components/Breadcrumbs";
import EmptyState from "@/components/EmptyState";
import type { DocumentMaterialRow } from "@/types/document_model";

const TIPO_INFO: Record<string, { label: string; plural: string }> = {
  edital: { label: "Edital", plural: "Editais" },
  licitacao: { label: "Licitação", plural: "Licitações" },
  contrato: { label: "Contrato/Termo", plural: "Contratos e termos" },
  relatorio: { label: "Relatório/Laudo", plural: "Relatórios e laudos" },
  extrato: { label: "Extrato", plural: "Extratos" },
  audiencia: { label: "Audiência pública", plural: "Audiências públicas" },
  portaria: { label: "Portaria", plural: "Portarias" },
  lei: { label: "Lei", plural: "Leis" },
  oficio: { label: "Ofício", plural: "Ofícios" },
  decreto: { label: "Decreto", plural: "Decretos" },
  resolucao: { label: "Resolução", plural: "Resoluções" },
};

type TabId =
  | "all"
  | "draft"
  | "review"
  | "approved"
  | "waiting_sign"
  | "signed"
  | "published";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "draft", label: "Rascunhos" },
  { id: "review", label: "Em revisão" },
  { id: "approved", label: "Aprovados" },
  { id: "waiting_sign", label: "Aguardando assinatura" },
  { id: "signed", label: "Assinados" },
  { id: "published", label: "Publicados" },
];

const EDITORIAL_LABEL: Record<string, string> = {
  draft: "Rascunho", review: "Em revisão", approved: "Aprovado",
  published: "Publicado", archived: "Arquivado", rejected: "Rejeitado",
};

function queryForTab(tab: TabId) {
  switch (tab) {
    case "draft": return { editorial: "draft" };
    case "review": return { editorial: "review" };
    case "approved": return { editorial: "approved" };
    case "waiting_sign": return { editorial: "approved", signature: "none" };
    case "signed": return { signature: "signed" };
    case "published": return { publication: "published" };
    default: return {};
  }
}

export default function TipoDocumentsPage() {
  const routeParams = useParams<{ tipo: string }>();
  const tipo = routeParams?.tipo && TIPO_INFO[routeParams.tipo] ? routeParams.tipo : "";
  const [tab, setTab] = useState<TabId>("all");
  const [rows, setRows] = useState<DocumentMaterialRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!tipo) return;
    setLoading(true);
    api
      .listMaterials({ document_type: tipo, ...queryForTab(tab), limit: 50 })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((err) => notifyError("materials.list", err))
      .finally(() => setLoading(false));
  }, [tipo, tab]);

  useEffect(() => {
    load();
  }, [load]);

  if (!tipo) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
          <EmptyState
            title="Tipo de documento inválido"
            description="O endereço acessado não corresponde a um tipo de ato reconhecido."
            action={
              <Link href="/documentos" className="btn btn-outline btn-sm">
                Ver documentos oficiais
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-container-max animate-fade-up px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: "Documentos oficiais", href: "/documentos" },
          { label: TIPO_INFO[tipo].plural },
        ]}
      />

      <PageHeader
        eyebrow="Documentos oficiais"
        title={TIPO_INFO[tipo].plural}
        description={`Atos do tipo ${TIPO_INFO[tipo].label} gerados a partir de modelos documentais. Estados derivados do fluxo real (a assinatura é da edição que contém o ato).`}
        actions={
          <Link href={`/documentos/criar?tipo=${tipo}`} className="btn btn-primary">
            <Plus size={18} aria-hidden="true" />
            Nova {TIPO_INFO[tipo].label}
          </Link>
        }
      />

      <div className="-mb-px mb-5 flex flex-wrap gap-1 border-b border-outline-variant">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`-mb-px border-b-2 px-3 py-2 text-body-sm font-medium transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:border-outline hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-outline-variant" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse border-b border-outline-variant bg-surface-container last:border-0" />
          ))}
          <span className="sr-only">Carregando…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
          <EmptyState
            title="Nenhum documento nesta aba"
            description="Crie uma minuta a partir de um modelo documental aprovado para vê-la listada aqui."
            action={
              <Link href={`/documentos/criar?tipo=${tipo}`} className="btn btn-primary btn-sm">
                <Plus size={16} aria-hidden="true" />
                Nova {TIPO_INFO[tipo].label}
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
            <table className="min-w-[720px] w-full text-left text-body-sm">
              <thead className="border-b border-outline-variant bg-surface-container-low">
                <tr>
                  <th className="eyebrow px-4 py-3 font-semibold">Número / Ano</th>
                  <th className="eyebrow px-4 py-3 font-semibold">Documento</th>
                  <th className="eyebrow px-4 py-3 font-semibold">Situação</th>
                  <th className="eyebrow px-4 py-3 font-semibold">Assinatura</th>
                  <th className="eyebrow px-4 py-3 font-semibold">Publicação</th>
                  <th className="eyebrow px-4 py-3 font-semibold">Edições</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/70">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-container-low">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-on-surface-variant">
                      {r.act_number ? `${r.act_number}/${r.act_year}` : "Sem número"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-on-surface">{r.title}</div>
                      {r.summary && <div className="text-body-sm text-on-surface-variant">{r.summary}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.editorial_status}>
                        {EDITORIAL_LABEL[r.editorial_status] ?? r.editorial_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.signature_status === "edition_signed" ? (
                        <span className="font-medium text-secondary">Assinado (na edição)</span>
                      ) : (
                        <span className="text-on-surface-variant">Não assinado</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.publication_status === "published" ? (
                        <span className="font-medium text-secondary">Publicado</span>
                      ) : (
                        <span className="text-on-surface-variant">Não publicado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">
                      {r.editions.length === 0
                        ? "—"
                        : r.editions
                            .map((e) => `Ed. ${e.number ?? ""}/${e.year ?? ""}`)
                            .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-body-sm text-on-surface-variant">{total} documento(s) neste filtro.</p>
        </>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  const color: Record<string, string> = {
    draft: "bg-surface-container text-on-surface-variant",
    review: "bg-warning-container text-on-warning-container",
    approved: "bg-primary-fixed text-on-primary-fixed",
    published: "bg-secondary-container text-on-secondary-container",
    archived: "bg-surface-container text-outline",
    rejected: "bg-error-container text-on-error-container",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-body-sm font-medium ${color[tone] ?? "bg-surface-container text-on-surface-variant"}`}>
      {children}
    </span>
  );
}
