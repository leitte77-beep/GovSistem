"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { EditionListItem } from "@/types/edition";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { formatDate, pluralMaterias } from "@/lib/format";
import { EDITION_STATUSES, EDITION_TYPES } from "@/lib/statusConfig";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import toast from "react-hot-toast";

const PAGE_SIZE = 15;

export default function EditionsPage() {
  const [editions, setEditions] = useState<EditionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [toDelete, setToDelete] = useState<EditionListItem | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api.listEditions({ status: status || undefined })
      .then((data) => {
        const filtered = data.filter((e) => !status || e.status === status);
        const sorted = [...filtered].sort((a, b) => b.year - a.year || b.number - a.number);
        const slice = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE + 1);
        if (slice.length > PAGE_SIZE) { setHasMore(true); setEditions(slice.slice(0, PAGE_SIZE)); }
        else { setHasMore(false); setEditions(slice); }
      })
      .catch((err) => { setError(err instanceof Error ? err.message : "Erro ao carregar edições"); notifyError("Editions", err); })
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { setPage(0); }, [status]);

  const runDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteEdition(toDelete.id);
      toast.success("Edição excluída");
      setEditions((prev) => prev.filter((e) => e.id !== toDelete.id));
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const hrefFor = (e: EditionListItem) => `/editions/${e.id}/edit`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Edições"
        description="Gerenciamento e publicação das edições do Diário Oficial."
        actions={
          <Link href="/editions/new" className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
            <Plus size={18} aria-hidden="true" />Nova edição
          </Link>
        }
      />

      {/* Filtro por status */}
      <section className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="Filtro de edições">
        <label className="block">
          <span className="sr-only">Status da edição</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 w-64 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30">
            <option value="">Todos os status</option>
            {Object.entries(EDITION_STATUSES).map(([code, def]) => (
              <option key={code} value={code}>{def.label}</option>
            ))}
          </select>
        </label>
        {status && (
          <button onClick={() => setStatus("")} className="text-sm font-semibold text-blue-700 hover:underline">Limpar filtro</button>
        )}
      </section>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-700" role="alert">Erro ao carregar edições: {error}</div>
        ) : (
          <>
            <table className="hidden w-full border-collapse text-left md:table">
              <caption className="sr-only">Lista de edições do Diário Oficial</caption>
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Nº</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Título</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Matérias</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Publicação</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse"><td colSpan={7}><div className="h-11 bg-gray-100" /></td></tr>
                  ))
                ) : editions.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="Nenhuma edição encontrada" description="Ajuste os filtros ou crie uma nova edição." /></td></tr>
                ) : editions.map((e) => {
                  const isEditable = EDITION_STATUSES[e.status]?.editable ?? false;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={hrefFor(e)} className="font-semibold text-blue-700 hover:underline">{e.year}/{String(e.number).padStart(2, "0")}</Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">{e.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{EDITION_TYPES[e.type] ?? e.type}</td>
                      <td className="px-4 py-3"><StatusBadge kind="edition" status={e.status} size="sm" /></td>
                      <td className="px-4 py-3 text-center">
                        <Link href={hrefFor(e)} title={pluralMaterias(e.item_count)} className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">
                          {e.item_count}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(e.publication_date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={hrefFor(e)} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50">
                            {isEditable ? "Editar" : "Visualizar"}
                          </Link>
                          {e.status !== "published" && (
                            <button
                              onClick={() => setToDelete(e)}
                              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile */}
            <ul className="divide-y divide-gray-100 md:hidden">
              {loading ? <li className="p-4 text-sm text-gray-500">Carregando…</li>
                : editions.length === 0 ? <li><EmptyState title="Nenhuma edição encontrada" /></li>
                : editions.map((e) => (
                  <li key={e.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={hrefFor(e)} className="font-semibold text-blue-700">{e.year}/{String(e.number).padStart(2, "0")} · {e.title}</Link>
                      <StatusBadge kind="edition" status={e.status} size="sm" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 text-sm text-gray-600">
                      <span>{EDITION_TYPES[e.type] ?? e.type}</span>
                      <span>{pluralMaterias(e.item_count)}</span>
                      <span>{formatDate(e.publication_date)}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </>
        )}

        {!loading && !error && editions.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-sm text-gray-600">Página {page + 1}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:opacity-50">
                <ChevronLeft size={16} aria-hidden="true" />Anterior
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore} className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:opacity-50">
                Próximo<ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir edição"
        message={toDelete ? `Tem certeza que deseja excluir permanentemente a edição ${toDelete.year}/${toDelete.number} — "${toDelete.title}"? O número ficará disponível para reuso.` : ""}
        confirmLabel="Excluir"
        destructive
        onConfirm={runDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
