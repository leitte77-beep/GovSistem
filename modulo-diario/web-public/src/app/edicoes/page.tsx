"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { api, EditionSummary, PaginationMeta } from "@/lib/api";
import { useOrg } from "@/lib/org-context";
import { formatSummary } from "@/lib/summary";
import ShareDialog from "@/components/ShareDialog";
import { notifyError } from "@/lib/error-handler";

const TYPE_LABELS: Record<string, string> = {
  normal: "ORDINÁRIA",
  extra: "EXTRAORDINÁRIA",
  suplementar: "SUPLEMENTAR",
};

const TYPE_STYLES: Record<string, string> = {
  normal: "bg-secondary-container text-on-secondary-container",
  extra: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  suplementar: "bg-primary-container text-on-primary-container",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function EditionsPage() {
  const { org } = useOrg();
  const [editions, setEditions] = useState<EditionSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [year, setYear] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 12;

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

  const fetchEditions = useCallback(() => {
    setLoading(true);
    api
      .listEditions({
        year: year ? Number(year) : undefined,
        search: search || undefined,
        page,
        page_size: pageSize,
      })
      .then((res) => {
        setEditions(res.data);
        setPagination(res.pagination);
      })
      .catch((err) => notifyError("EdicoesPublic", err))
      .finally(() => setLoading(false));
  }, [year, search, page]);

  useEffect(() => {
    fetchEditions();
  }, [fetchEditions]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchEditions();
  };

  const totalPages = pagination?.total_pages || 0;

  const getPageNumbers = (): (number | "...")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [];
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 3); i++) {
      pages.push(i);
    }
    if (page < totalPages - 4) pages.push("...");
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };

  return (
    <main className="max-w-container-max mx-auto px-gutter py-stack-lg min-h-screen">
      {/* Title Section */}
      <section className="mb-stack-lg">
        <h1 className="text-headline-lg font-headline-lg text-primary mb-4">
          Edições Publicadas
        </h1>
        <p className="text-body-md font-body-md text-on-surface-variant max-w-2xl">
          Acesse o histórico completo de publicações oficiais, atos normativos e
          decisões administrativas {org?.name ? `da(o) ${org.name}` : "do município"}.
        </p>
      </section>

      {/* Search & Filter Bar */}
      <section className="bg-surface-container-lowest border border-outline-variant p-gutter rounded-xl shadow-sm mb-stack-md">
        <form
          onSubmit={handleFilter}
          className="flex flex-col md:flex-row gap-4 items-center"
        >
          <div className="relative flex-grow w-full">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
              search
            </span>
            <input
              className="w-full h-14 pl-12 pr-4 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all text-body-md outline-none"
              placeholder="Buscar por título ou palavra-chave..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full md:w-64">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                calendar_today
              </span>
              <select
                className="w-full h-14 pl-12 pr-4 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all text-body-md appearance-none cursor-pointer outline-none"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">Todos os anos</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="w-full md:w-auto px-8 h-14 bg-primary text-on-primary font-bold rounded-lg hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            Filtrar
          </button>
        </form>
      </section>

      {/* Results Counter + Sort */}
      <div className="flex justify-between items-center mb-stack-sm px-2">
        <span className="text-label-md font-label-md text-on-surface-variant">
          Mostrando {editions.length} de{" "}
          {pagination?.total != null ? pagination.total.toLocaleString("pt-BR") : "..."}{" "}
          edições
        </span>
        <div className="flex items-center gap-2">
          <span className="text-label-md font-label-md text-on-surface-variant">
            Ordenar por:
          </span>
          <span className="text-label-md font-label-md text-primary">
            Mais recentes
          </span>
        </div>
      </div>

      {/* Loading / Empty states */}
      {loading ? (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl mb-4 block">
            hourglass_empty
          </span>
          Carregando edições...
        </div>
      ) : editions.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl mb-4 block">
            search_off
          </span>
          Nenhuma edição encontrada
        </div>
      ) : (
        <>
          {/* Vertical Editions List */}
          <div className="flex flex-col gap-stack-md">
            {editions.map((edition) => (
              <article
                key={edition.id}
                className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-6 flex flex-col md:flex-row gap-6 hover:border-primary transition-all duration-200"
              >
                <div className="flex flex-col md:w-1/4">
                  <div
                    className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold tracking-wider w-fit mb-3 ${
                      TYPE_STYLES[edition.type] || TYPE_STYLES.normal
                    }`}
                  >
                    {TYPE_LABELS[edition.type] || TYPE_LABELS.normal}
                  </div>
                  <time className="text-body-sm font-body-sm text-on-surface-variant mb-1">
                    {formatDate(edition.publication_date)}
                  </time>
                  <h2 className="text-headline-sm font-headline-sm text-primary leading-tight">
                    {edition.title}
                  </h2>
                </div>

                <div className="flex-grow md:border-l md:border-outline-variant md:pl-8">
                  <h3 className="flex items-center gap-2 text-label-md font-label-md text-on-surface-variant uppercase tracking-widest mb-3">
                    <span className="h-px w-6 bg-secondary" />
                    Súmula do Dia
                  </h3>
                  <ul className="space-y-2">
                    <li className="rounded-lg border border-outline-variant/70 bg-surface-container-low/45 px-4 py-3 text-body-sm font-body-sm text-on-surface leading-7">
                      {formatSummary(edition.daily_summary)}
                    </li>
                    <li className="flex gap-3 text-body-sm font-body-sm text-on-surface">
                      <span className="material-symbols-outlined text-[18px] text-secondary">
                        calendar_today
                      </span>
                      <span>
                        Publicada em {formatShortDate(edition.publication_date)}.
                      </span>
                    </li>
                    {edition.verification_code && (
                      <li className="flex gap-3 text-body-sm font-body-sm text-on-surface">
                        <span className="material-symbols-outlined text-[18px] text-secondary">
                          verified
                        </span>
                        <span>
                          Código de verificação:{" "}
                          <code className="bg-surface-container px-1.5 py-0.5 rounded text-label-md font-mono">
                            {edition.verification_code}
                          </code>
                        </span>
                      </li>
                    )}
                  </ul>
                </div>

                <div className="flex md:flex-col gap-3 justify-end md:justify-center md:items-end">
                  <Link
                    href={`/edicoes/${edition.year}/${edition.number}`}
                    className="bg-primary text-on-primary px-6 py-2.5 rounded-lg text-label-md font-label-md hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      visibility
                    </span>
                    Visualizar
                  </Link>
                  <div className="flex gap-2">
                    {edition.pdf_url && (
                      <a
                        href={edition.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 border border-outline-variant rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-all"
                        aria-label="Baixar PDF"
                      >
                        <span className="material-symbols-outlined">
                          download
                        </span>
                      </a>
                    )}
                    <ShareDialog
                      url={`${typeof window !== "undefined" ? window.location.origin : ""}/edicoes/${edition.year}/${edition.number}`}
                      title={`Edição ${edition.number}/${edition.year} - Diário Oficial`}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="flex justify-center items-center gap-2 mt-stack-lg">
              <button
                className="p-2 text-primary hover:bg-primary-fixed rounded-lg transition-all disabled:opacity-30"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Página anterior"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>

              {getPageNumbers().map((p, i) =>
                p === "..." ? (
                  <span key={`dots-${i}`} className="px-2 text-on-surface-variant">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    className={`w-10 h-10 rounded-lg font-bold transition-all ${
                      page === p - 1
                        ? "bg-primary text-on-primary"
                        : "hover:bg-surface-container-low"
                    }`}
                    onClick={() => setPage(p - 1)}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                className="p-2 text-primary hover:bg-primary-fixed rounded-lg transition-all disabled:opacity-30"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                aria-label="Próxima página"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </nav>
          )}
        </>
      )}

      {/* Digital Signature Section */}
      <aside className="bg-surface-container border-t border-outline-variant py-stack-lg mt-stack-lg">
        <div className="max-w-container-max mx-auto px-gutter grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-headline-md font-headline-md text-primary mb-4">
              Assinatura Digital de Confiança
            </h2>
            <p className="text-body-md font-body-md text-on-surface-variant mb-6">
              Todas as edições do Diário Oficial são assinadas digitalmente,
              garantindo a autenticidade e integridade jurídica de cada documento
              publicado.
            </p>
            <div className="flex gap-4">
              <Link
                href="/verificar"
                className="flex items-center gap-2 bg-secondary-container px-4 py-2 rounded-lg"
              >
                <span
                  className="material-symbols-outlined text-on-secondary-container"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified_user
                </span>
                <span className="text-label-md font-label-md text-on-secondary-container">
                  AUTENTICIDADE GARANTIDA
                </span>
              </Link>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden shadow-xl aspect-video relative group">
            <Image
              alt="Segurança jurídica"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuB17a1fxXJD2D-OsgQhGI42eFho94Py9-ndKjPfk-fYvuMkYXvu2ymhBCmXcgd-EFSDurMPaHEz4FiDDFJmnvWVClyDIJ2xMbsdLo44gIoONgnJHFB39jNczui3ek05Oh_ZWq8MHgT_V0uTryEkg3o03Ek3BZt2Jsm0Q5gbpoN_IoV8WTKwUDXpzAMcBeumIYlxS5W3xoBtYu9lLdFQ8bAj8Nb_0KcHzE_b78RPEAJjGI4jytVOE7bClMxt4Andma91w-4Ee0t9ZFKm"
            />
          </div>
        </div>
      </aside>
    </main>
  );
}
