"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import type { EditionListItem } from "@/types/edition";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { formatDate, pluralMaterias } from "@/lib/format";
import { EDITION_STATUSES, EDITION_TYPES, editionStatusLabel } from "@/lib/statusConfig";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import toast from "react-hot-toast";

const PAGE_SIZE = 15;

/** Filtro inicial vindo da URL (?status=signed) — os atalhos da visão geral
 *  levam direto à fila correspondente. */
function initialStatus(): string {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get("status") || "";
  return value in EDITION_STATUSES ? value : "";
}

export default function EditionsPage() {
  const [editions, setEditions] = useState<EditionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [toDelete, setToDelete] = useState<EditionListItem | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api.listEditions({ status: status || undefined })
      .then((data) => {
        const filtered = data.filter((e) => !status || e.status === status);
        // Ordena pela hora de publicação (a edição mais recente/publicada fica na
        // frente), desempate por data de publicação e número. Garante que uma
        // edição EXTRA publicada depois da última normal apareça à frente dela.
        const sorted = [...filtered].sort(
          (a, b) =>
            (b.published_at || "").localeCompare(a.published_at || "") ||
            (b.publication_date || "").localeCompare(a.publication_date || "") ||
            b.year - a.year ||
            b.number - a.number,
        );
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
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <PageHeader
        eyebrow="Publicação"
        title="Edições"
        description="Gerencie, revise e publique as edições do Diário Oficial em um só lugar."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/editions/queue" className="btn-outline">
              <Layers size={18} aria-hidden="true" />
              Fila de publicação
            </Link>
            <Link href="/editions/new" className="btn-primary">
              <Plus size={18} aria-hidden="true" />
              Nova edição
            </Link>
          </div>
        }
      />

      {/* Filtro por status */}
      <section
        className="mb-5 flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-card sm:flex-row sm:items-center sm:justify-between"
        aria-label="Filtro de edições"
      >
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Status da edição</span>
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-outline" aria-hidden="true">filter_list</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-outline-variant bg-surface pl-10 pr-9 text-body-md font-medium text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          >
            <option value="">Todos os status</option>
            {Object.entries(EDITION_STATUSES).map(([code, def]) => (
              <option key={code} value={code}>{def.label}</option>
            ))}
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true">expand_more</span>
        </label>
        {status && (
          <button onClick={() => setStatus("")} className="btn-ghost btn-sm self-start sm:self-auto">
            Limpar filtro
          </button>
        )}
      </section>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        {error ? (
          <div className="p-6 text-center text-body-md text-error" role="alert">Erro ao carregar edições: {error}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-4 py-2.5 sm:px-5">
              <p className="text-body-sm text-on-surface-variant" aria-live="polite">
                {loading
                  ? "Carregando…"
                  : editions.length === 0
                    ? "Nenhuma edição encontrada"
                    : `Página ${page + 1} · ${editions.length} ${editions.length === 1 ? "edição" : "edições"}`}
              </p>
              {status && (
                <span className="hidden items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-body-sm font-medium text-on-surface-variant sm:inline-flex">
                  Status: {editionStatusLabel(status)}
                </span>
              )}
            </div>

            <div className="hidden md:block">
              <table className="w-full table-fixed border-collapse text-left">
                <caption className="sr-only">Lista de edições do Diário Oficial</caption>
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low">
                    <th scope="col" className="w-[9%] px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Nº</th>
                    <th scope="col" className="w-[30%] px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Título</th>
                    <th scope="col" className="w-[12%] px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Tipo</th>
                    <th scope="col" className="w-[14%] px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Status</th>
                    <th scope="col" className="w-[9%] px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-on-surface-variant">Matérias</th>
                    <th scope="col" className="w-[13%] px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Publicação</th>
                    <th scope="col" className="w-[13%] px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-on-surface-variant">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={7} className="px-5 py-4"><div className="h-11 rounded-lg bg-surface-container-high" /></td>
                      </tr>
                    ))
                  ) : editions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6">
                        <EmptyState
                          title="Nenhuma edição encontrada"
                          description="Ajuste os filtros ou crie uma nova edição."
                          action={<Link href="/editions/new" className="btn-primary btn-sm"><Plus size={16} aria-hidden="true" />Nova edição</Link>}
                        />
                      </td>
                    </tr>
                  ) : editions.map((e) => {
                    const isEditable = EDITION_STATUSES[e.status]?.editable ?? false;
                    return (
                      <tr key={e.id} className="group transition-colors hover:bg-surface-container-low/70">
                        <td className="px-5 py-4 align-middle">
                          <Link href={hrefFor(e)} className="font-display text-body-lg font-bold text-primary transition-colors hover:underline">
                            {e.year}/{String(e.number).padStart(2, "0")}
                          </Link>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <span className="line-clamp-2 text-body-md font-semibold leading-5 text-on-surface">{e.title}</span>
                        </td>
                        <td className="px-4 py-4 align-middle text-body-md text-on-surface-variant">{EDITION_TYPES[e.type] ?? e.type}</td>
                        <td className="px-4 py-4 align-middle"><StatusBadge kind="edition" status={e.status} size="sm" /></td>
                        <td className="px-3 py-4 text-center align-middle">
                          <Link
                            href={hrefFor(e)}
                            title={pluralMaterias(e.item_count)}
                            className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-surface-container px-2.5 py-1 text-body-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high"
                          >
                            {e.item_count}
                          </Link>
                        </td>
                        <td className="px-4 py-4 align-middle text-body-md text-on-surface-variant">{formatDate(e.publication_date)}</td>
                        <td className="px-5 py-4 align-middle">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={hrefFor(e)} className="btn-ghost btn-sm">
                              {isEditable ? "Editar" : "Visualizar"}
                            </Link>
                            {e.status !== "published" && (
                              <button
                                onClick={() => setToDelete(e)}
                                className="btn btn-sm text-error hover:bg-error-container/50"
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
            </div>

            {/* Mobile */}
            <div className="divide-y divide-outline-variant/40 md:hidden">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="m-4 h-40 animate-pulse rounded-xl bg-surface-container-high" />
                ))
              ) : editions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="Nenhuma edição encontrada"
                    description="Ajuste os filtros ou crie uma nova edição."
                    action={<Link href="/editions/new" className="btn-primary btn-sm"><Plus size={16} aria-hidden="true" />Nova edição</Link>}
                  />
                </div>
              ) : editions.map((e) => {
                const isEditable = EDITION_STATUSES[e.status]?.editable ?? false;
                return (
                  <article key={e.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={hrefFor(e)} className="font-display text-body-lg font-bold text-primary hover:underline">
                          {e.year}/{String(e.number).padStart(2, "0")}
                        </Link>
                        <p className="mt-0.5 truncate text-body-md font-semibold text-on-surface">{e.title}</p>
                      </div>
                      <StatusBadge kind="edition" status={e.status} size="sm" />
                    </div>
                    <dl className="my-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-container-low p-3 text-body-sm">
                      <div><dt className="text-outline">Tipo</dt><dd className="mt-0.5 font-semibold text-on-surface">{EDITION_TYPES[e.type] ?? e.type}</dd></div>
                      <div><dt className="text-outline">Matérias</dt><dd className="mt-0.5 font-semibold text-on-surface">{e.item_count}</dd></div>
                      <div><dt className="text-outline">Publicação</dt><dd className="mt-0.5 font-semibold text-on-surface">{formatDate(e.publication_date)}</dd></div>
                    </dl>
                    <div className="flex items-center gap-2">
                      <Link href={hrefFor(e)} className="btn-outline btn-sm flex-1 justify-center">
                        {isEditable ? "Editar" : "Visualizar"}
                      </Link>
                      {e.status !== "published" && (
                        <button
                          onClick={() => setToDelete(e)}
                          className="btn btn-sm justify-center border border-outline-variant text-error hover:bg-error-container/50"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {!loading && !error && editions.length > 0 && (
              <div className="flex items-center justify-between border-t border-outline-variant bg-surface-container-low px-4 py-3 sm:px-5">
                <span className="text-body-sm font-medium text-on-surface-variant">Página {page + 1}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="btn-outline btn-sm"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    <span className="hidden sm:inline">Anterior</span>
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore}
                    className="btn-outline btn-sm"
                  >
                    <span className="hidden sm:inline">Próximo</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </>
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
