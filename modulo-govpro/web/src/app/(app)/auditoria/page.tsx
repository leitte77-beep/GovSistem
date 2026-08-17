"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { AuditoriaEvento } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import { formatDateTime } from "@/lib/format";

export default function AuditoriaPage() {
  const [eventos, setEventos] = useState<AuditoriaEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [filtroEntity, setFiltroEntity] = useState("");
  const [filtroAction, setFiltroAction] = useState("");
  const [filtroProcessoId, setFiltroProcessoId] = useState("");

  const carregar = useCallback(() => {
    setLoading(true);
    api
      .listAuditoria({
        entity: filtroEntity || undefined,
        action: filtroAction || undefined,
        processo_id: filtroProcessoId || undefined,
        limit: 100,
      })
      .then(setEventos)
      .catch((err) => {
        setErro(true);
        toast.error(err instanceof Error ? err.message : "Falha ao carregar auditoria");
      })
      .finally(() => setLoading(false));
  }, [filtroEntity, filtroAction, filtroProcessoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    carregar();
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Auditoria"
        subtitle="Trilha de eventos append-only, encadeada por hash — leitura estrita, sem edição."
      />

      <div className="px-gutter max-w-container-max mx-auto">
        <form
          onSubmit={onSubmit}
          className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <input
            value={filtroEntity}
            onChange={(e) => setFiltroEntity(e.target.value)}
            placeholder="Entidade (ex.: processo, documento)"
            className="h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          />
          <input
            value={filtroAction}
            onChange={(e) => setFiltroAction(e.target.value)}
            placeholder="Ação (ex.: CRIACAO, ASSINATURA)"
            className="h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2">
            <input
              value={filtroProcessoId}
              onChange={(e) => setFiltroProcessoId(e.target.value)}
              placeholder="ID do processo"
              className="flex-1 h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              className="h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
            >
              Filtrar
            </button>
          </div>
        </form>

        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : erro ? (
          <EmptyState icon="lock" title="Sem acesso à auditoria" description="Este painel exige o perfil Auditor ou Administrador." />
        ) : eventos.length === 0 ? (
          <EmptyState icon="fact_check" title="Nenhum evento encontrado" description="Ajuste os filtros ou aguarde novos eventos." />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Data/hora</th>
                  <th className="px-4 py-3">Ação</th>
                  <th className="px-4 py-3">Entidade</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Processo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {eventos.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant whitespace-nowrap">
                      {formatDateTime(e.occurred_at)}
                    </td>
                    <td className="px-4 py-3"><Badge tone="primary">{e.action}</Badge></td>
                    <td className="px-4 py-3 text-body-sm text-on-surface">
                      {e.entity}
                      {e.entity_id && <span className="text-on-surface-variant"> #{e.entity_id.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-body-sm text-on-surface-variant">{e.ip_address ?? "—"}</td>
                    <td className="px-4 py-3 text-body-sm">
                      {e.processo_id ? (
                        <Link href={`/processos/${e.processo_id}`} className="text-primary hover:underline">
                          {e.nup ?? "ver processo"}
                        </Link>
                      ) : (
                        "—"
                      )}
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
