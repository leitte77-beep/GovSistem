"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import type { DocumentModelSummary } from "@/types/document_model";

const TIPOS: { tipo: string; label: string; plural: string; desc: string }[] = [
  { tipo: "edital", label: "Edital", plural: "Editais", desc: "Convocações, licitações e avisos públicos." },
  { tipo: "portaria", label: "Portaria", plural: "Portarias", desc: "Atos internos de nomeação, férias e afins." },
  { tipo: "lei", label: "Lei", plural: "Leis", desc: "Normas aprovadas pelo Legislativo e sancionadas." },
  { tipo: "oficio", label: "Ofício", plural: "Ofícios", desc: "Comunicações oficiais entre órgãos." },
  { tipo: "decreto", label: "Decreto", plural: "Decretos", desc: "Atos do Executivo de caráter normativo." },
  { tipo: "resolucao", label: "Resolução", plural: "Resoluções", desc: "Decisões colegiadas ou de conselhos." },
];

export default function DocumentosPage() {
  const [models, setModels] = useState<DocumentModelSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listDocumentModels()
      .then(setModels)
      .catch((err) => notifyError("documentos.list", err))
      .finally(() => setLoading(false));
  }, []);

  const activeByType: Record<string, number> = {};
  const totalByType: Record<string, number> = {};
  for (const m of models ?? []) {
    totalByType[m.document_type] = (totalByType[m.document_type] ?? 0) + 1;
    if (m.status === "active" && m.active_version) {
      activeByType[m.document_type] = (activeByType[m.document_type] ?? 0) + 1;
    }
  }

  return (
    <div className="p-gutter max-w-6xl">
      <PageHeader
        title="Documentos oficiais"
        description="Gestão de atos por tipo, gerados a partir de modelos documentais aprovados. A numeração, as assinaturas e a publicação são responsabilidade do sistema."
        actions={
          <div className="flex gap-2">
            <Link
              href="/documentos/criar"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <span className="material-symbols-outlined text-base">smart_toy</span>
              Criar com IA
            </Link>
            <Link
              href="/documentos/modelos"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <span className="material-symbols-outlined text-base">dashboard_customize</span>
              Modelos documentais
            </Link>
            <Link
              href="/settings/ai"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-base">smart_toy</span>
              Configuração de IA
            </Link>
          </div>
        }
      />

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        Para criar um documento, cadastre e <strong>aprove</strong> um modelo documental
        do tipo desejado (Configurações → Inteligência artificial cadastra a chave DeepSeek).
        Sem um modelo aprovado, nenhuma minuta é apresentada como padrão institucional.
      </div>

      {loading ? (
        <p className="mt-8 text-center text-sm text-gray-500">Carregando modelos…</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TIPOS.map((t) => (
            <Link
              key={t.tipo}
              href={`/documentos/tipos/${t.tipo}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{t.plural}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t.desc}</p>
                </div>
                <span className="material-symbols-outlined text-gray-300 group-hover:text-blue-400">
                  chevron_right
                </span>
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm">
                <span className="text-gray-700">
                  <span className="font-semibold text-gray-900">{activeByType[t.tipo] ?? 0}</span>{" "}
                  ativos
                </span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-700">
                  <span className="font-semibold text-gray-900">{totalByType[t.tipo] ?? 0}</span>{" "}
                  modelos
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-gray-400">
        Clique em um tipo para ver seus atos com situação editorial, de assinatura e de
        publicação (estados derivados do fluxo real de matérias e edições).
      </p>
    </div>
  );
}
