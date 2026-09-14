"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import type { DocumentMaterialRow } from "@/types/document_model";

const TIPO_INFO: Record<string, { label: string; plural: string }> = {
  edital: { label: "Edital", plural: "Editais" },
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

export default function TipoDocumentsPage({ params }: { params: { tipo: string } }) {
  const tipo = TIPO_INFO[params.tipo] ? params.tipo : "";
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
      <div className="p-gutter max-w-5xl">
        <p className="py-10 text-center text-sm text-gray-500">Tipo de documento inválido.</p>
      </div>
    );
  }

  return (
    <div className="p-gutter max-w-6xl">
      <PageHeader
        title={TIPO_INFO[tipo].plural}
        description={`Atos do tipo ${TIPO_INFO[tipo].label} gerados a partir de modelos documentais. Estados derivados do fluxo real (a assinatura é da edição que contém o ato).`}
        actions={
          <Link
            href={`/documentos/criar?tipo=${tipo}`}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <span className="material-symbols-outlined text-base">note_add</span>
            Nova {TIPO_INFO[tipo].label}
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-500">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
          Nenhum documento nesta aba. Crie uma minuta a partir de um modelo documental
          aprovado para vê-la listada aqui.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Número / Ano</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Assinatura</th>
                  <th className="px-4 py-3">Publicação</th>
                  <th className="px-4 py-3">Edições</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {r.act_number ? `${r.act_number}/${r.act_year}` : "Sem número"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.title}</div>
                      {r.summary && <div className="text-xs text-gray-500">{r.summary}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.editorial_status}>
                        {EDITORIAL_LABEL[r.editorial_status] ?? r.editorial_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.signature_status === "edition_signed" ? (
                        <span className="text-green-700">Assinado (na edição)</span>
                      ) : (
                        <span className="text-gray-500">Não assinado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.publication_status === "published" ? "Publicado" : "Não publicado"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
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
          <p className="mt-2 text-xs text-gray-500">{total} documento(s) neste filtro.</p>
        </>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  const color: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    review: "bg-amber-100 text-amber-800",
    approved: "bg-blue-100 text-blue-800",
    published: "bg-green-100 text-green-800",
    archived: "bg-gray-200 text-gray-500",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color[tone] ?? "bg-gray-100 text-gray-700"}`}>
      {children}
    </span>
  );
}
