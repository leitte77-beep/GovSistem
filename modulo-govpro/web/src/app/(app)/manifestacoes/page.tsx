"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { ManifestacaoOut } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";

const TIPO_LABEL: Record<string, string> = {
  DENUNCIA: "Denúncia",
  RECLAMACAO: "Reclamação",
  ELOGIO: "Elogio",
  SUGESTAO: "Sugestão",
  SOLICITACAO: "Solicitação",
};

const TIPO_TONE: Record<string, "error" | "warning" | "success" | "primary" | "neutral"> = {
  DENUNCIA: "error",
  RECLAMACAO: "warning",
  ELOGIO: "success",
  SUGESTAO: "primary",
  SOLICITACAO: "neutral",
};

export default function ManifestacoesPage() {
  const [manifestacoes, setManifestacoes] = useState<ManifestacaoOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listManifestacoes()
      .then(setManifestacoes)
      .catch(() => toast.error("Falha ao carregar manifestações"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Ouvidoria"
        subtitle="Manifestações recebidas do cidadão (Lei nº 13.460/2017): denúncias, reclamações, elogios, sugestões e solicitações."
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : manifestacoes.length === 0 ? (
          <EmptyState icon="campaign" title="Nenhuma manifestação recebida" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <ul className="divide-y divide-outline-variant">
              {manifestacoes.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone={TIPO_TONE[m.tipo] ?? "neutral"}>{TIPO_LABEL[m.tipo] ?? m.tipo}</Badge>
                    {m.anonima && <Badge tone="neutral">Anônima</Badge>}
                    <Badge tone="neutral">{m.status}</Badge>
                  </div>
                  <p className="text-body-md text-on-surface">{m.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
