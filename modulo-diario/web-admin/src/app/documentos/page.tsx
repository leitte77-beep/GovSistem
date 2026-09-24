"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Info, LayoutTemplate, Settings2, Sparkles } from "lucide-react";
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
    <div className="mx-auto w-full max-w-container-max animate-fade-up px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Publicação oficial"
        title="Documentos oficiais"
        description="Gestão de atos por tipo, gerados a partir de modelos documentais aprovados. A numeração, as assinaturas e a publicação são responsabilidade do sistema."
        actions={
          <>
            <Link href="/documentos/criar" className="btn btn-primary">
              <Sparkles size={18} aria-hidden="true" />
              Criar com IA
            </Link>
            <Link href="/documentos/modelos" className="btn btn-outline">
              <LayoutTemplate size={18} aria-hidden="true" />
              Modelos documentais
            </Link>
            <Link href="/settings/ai" className="btn btn-ghost">
              <Settings2 size={18} aria-hidden="true" />
              Configuração de IA
            </Link>
          </>
        }
      />

      <div className="flex items-start gap-3 border-l-2 border-primary bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant">
        <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Para criar um documento, cadastre e{" "}
          <strong className="font-semibold text-on-surface">aprove</strong> um modelo documental
          do tipo desejado (Configurações → Inteligência artificial cadastra a chave DeepSeek).
          Sem um modelo aprovado, nenhuma minuta é apresentada como padrão institucional.
        </p>
      </div>

      {loading ? (
        <div className="mt-8 space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-xl bg-surface-container" />
          ))}
          <span className="sr-only">Carregando modelos…</span>
        </div>
      ) : (
        <section className="mt-8" aria-label="Tipos de documento">
          <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            {TIPOS.map((t, i) => (
              <li key={t.tipo}>
                <Link
                  href={`/documentos/tipos/${t.tipo}`}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-container-low"
                >
                  <span
                    className="w-7 shrink-0 font-mono text-body-sm tabular-nums text-outline transition-colors group-hover:text-primary"
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-headline-sm text-on-surface transition-colors group-hover:text-primary">
                      {t.plural}
                    </span>
                    <span className="mt-0.5 block text-body-sm text-on-surface-variant">{t.desc}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-on-surface-variant">
                      <span>
                        <strong className="font-semibold text-on-surface">{activeByType[t.tipo] ?? 0}</strong>{" "}
                        ativos
                      </span>
                      <span className="text-outline" aria-hidden="true">
                        ·
                      </span>
                      <span>
                        <strong className="font-semibold text-on-surface">{totalByType[t.tipo] ?? 0}</strong>{" "}
                        modelos
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-outline transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 border-t border-outline-variant pt-4 text-body-sm text-on-surface-variant">
        Clique em um tipo para ver seus atos com situação editorial, de assinatura e de
        publicação (estados derivados do fluxo real de matérias e edições).
      </p>
    </div>
  );
}
