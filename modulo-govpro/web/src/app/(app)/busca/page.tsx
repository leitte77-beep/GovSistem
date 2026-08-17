"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { ProcessoOut } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { formatDate } from "@/lib/format";
import { SituacaoBadge } from "@/components/processo/badges";

export default function BuscaPage() {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProcessoOut[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 3) {
      toast.error("Digite ao menos 3 caracteres");
      return;
    }
    setBuscando(true);
    try {
      const r = await api.buscarGlobal(q.trim());
      setResultados(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na busca");
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader title="Busca" subtitle="Pesquise processos por NUP, número antigo ou assunto. Resultados respeitam suas permissões de acesso." />

      <div className="px-gutter max-w-container-max mx-auto">
        <form onSubmit={buscar} className="flex gap-3 mb-6">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder="NUP, número antigo ou assunto…"
            className="flex-1 h-12 px-4 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={buscando}
            className="h-12 px-6 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
          >
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </form>

        {resultados === null ? (
          <EmptyState icon="search" title="Digite algo para começar" />
        ) : resultados.length === 0 ? (
          <EmptyState icon="search_off" title="Nenhum processo encontrado" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <ul className="divide-y divide-outline-variant">
              {resultados.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/processos/${p.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-surface-container-low transition-colors"
                  >
                    <span className="font-mono text-body-sm text-primary">{p.nup}</span>
                    <span className="flex-1 text-body-md text-on-surface truncate">{p.especificacao}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-body-sm text-on-surface-variant">{formatDate(p.data_autuacao)}</span>
                      <SituacaoBadge situacao={p.situacao} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
