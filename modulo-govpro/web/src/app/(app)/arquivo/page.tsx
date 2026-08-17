"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TtdItem } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";

export default function ArquivoPage() {
  const [ttd, setTtd] = useState<TtdItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listTtd()
      .then(setTtd)
      .catch(() => setTtd([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Arquivo"
        subtitle="Tabela de Temporalidade e Destinação (TTD) — ciclo arquivístico CONARQ."
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando TTD…</div>
        ) : ttd.length === 0 ? (
          <EmptyState icon="archive" title="TTD ainda não configurada" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Classe</th>
                  <th className="px-4 py-3">Corrente (anos)</th>
                  <th className="px-4 py-3">Intermediária (anos)</th>
                  <th className="px-4 py-3">Destinação final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {ttd.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-body-md text-on-surface">{t.classe}</td>
                    <td className="px-4 py-3 text-body-md">{t.prazo_corrente_anos}</td>
                    <td className="px-4 py-3 text-body-md">{t.prazo_intermediario_anos}</td>
                    <td className="px-4 py-3">
                      <Badge tone={t.destinacao_final === "ELIMINACAO" ? "warning" : "success"}>
                        {t.destinacao_final === "ELIMINACAO" ? "Eliminação" : "Guarda permanente"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
