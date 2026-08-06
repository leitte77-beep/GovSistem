"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { api, EditionSummary, PaginationMeta } from "@/lib/api";
import { useOrg } from "@/lib/org-context";
import EditionCard from "@/components/EditionCard";

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
      .catch(() => {})
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
    <main className="max-w-container-max mx-auto px-margin-mobile md:px-gutter py-stack-lg min-h-screen">
      {/* Hero Section */}
      <section className="mb-stack-lg">
        <h1 className="font-display-lg text-headline-lg md:text-display-lg text-on-surface mb-2">
          Edições do Diário Oficial
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          Acesse o histórico completo de publicações oficiais, atos normativos e
          decisões administrativas{" "}
          {org?.name ? `da(o) ${org.name}` : "do município"} com total
          transparência e segurança jurídica.
        </p>
      </section>

      {/* Search Bar Section */}
      <section className="mb-stack-lg">
        <form
          onSubmit={handleFilter}
          className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.05)] p-2 flex flex-col md:flex-row items-center gap-2 border border-outline-variant"
        >
          <div className="flex-grow flex items-center px-4 gap-3 w-full">
            <span className="material-symbols-outlined text-outline">search</span>
            <input
              className="w-full border-none focus:ring-0 bg-transparent py-4 font-body-md text-body-md text-on-surface outline-none"
              placeholder="Buscar por título ou palavra-chave..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="h-8 w-px bg-outline-variant hidden md:block" />
          <div className="flex items-center px-4 gap-3 w-full md:w-auto">
            <span className="material-symbols-outlined text-outline">
              calendar_month
            </span>
            <select
              className="border-none focus:ring-0 bg-transparent py-4 pr-8 font-label-md text-label-md text-on-surface min-w-[140px] cursor-pointer outline-none"
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
          <button
            type="submit"
            className="w-full md:w-auto bg-primary-container text-on-primary px-10 py-4 rounded-lg font-label-md text-label-md hover:bg-opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            Filtrar
          </button>
        </form>
      </section>

      {/* Results Counter & Sort */}
      <div className="flex justify-between items-center mb-stack-sm px-2">
        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
          Mostrando {editions.length} de{" "}
          {pagination?.total != null
            ? pagination.total.toLocaleString("pt-BR")
            : "..."}{" "}
          edições
        </span>
        <div className="flex items-center gap-2 font-label-sm text-label-sm">
          <span className="text-outline">Ordenar por:</span>
          <span className="text-on-surface font-bold">Mais recentes</span>
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
          {/* Edition Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {editions.map((edition) => (
              <EditionCard key={edition.id} edition={edition} compact />
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

      {/* Trust Section / Assinatura Digital */}
      <section className="mt-stack-lg rounded-xl overflow-hidden bg-surface-container relative">
        <div className="grid md:grid-cols-2 items-center">
          <div className="p-stack-md lg:p-margin-desktop space-y-stack-sm relative z-10">
            <h2 className="font-headline-lg text-headline-lg text-on-surface">
              Assinatura Digital de Confiança
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Todas as edições do Diário Oficial são assinadas digitalmente
              seguindo os padrões da ICP-Brasil, garantindo a autenticidade,
              integridade e validade jurídica de cada documento publicado.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <Link
                href="/verificar"
                className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-4 py-2 rounded-full font-label-md text-label-md shadow-sm"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
                AUTENTICIDADE GARANTIDA
              </Link>
              <span className="inline-flex items-center gap-2 border border-outline text-on-surface px-4 py-2 rounded-full font-label-md text-label-md">
                <span className="material-symbols-outlined">lock</span>
                CRIPTOGRAFIA ICP-BRASIL
              </span>
            </div>
          </div>
          <div className="p-stack-md lg:p-margin-desktop flex justify-center items-center">
            <div className="relative w-full max-w-sm aspect-video bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden border border-outline-variant transform lg:rotate-2 hover:rotate-0 transition-transform duration-500 motion-reduce:transform-none">
              <Image
                alt="Certificado digital com segurança jurídica"
                fill
                sizes="(max-width: 768px) 100vw, 384px"
                className="object-cover opacity-80"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBPdg-JR4LN5VZO11R2aeV0G9OTI8tl76U9ByQ6WP86uXQl4doTAer3Xh8_0VMbK_yfNh-Mebk5t6YhI4BAQDpYf_nxb4kaHv0py-jy3Swue4ijv2NsUPO6Yqv7e5sNJKlqcGbpwzuhwCDh9CgOU7TDvWkds3KM09BFt3h3WUH7g-qDxKLklPMbPHLQEp4pbKjrXf1kkGYPA5nDpXSWdE9F4CLO-lp_zXwBWY-DKiQiJK3vFAaerGW5"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-highest/60 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center text-on-surface">
                <span className="font-label-sm text-label-sm font-bold">
                  SEGURANÇA JURÍDICA
                </span>
                <span className="material-symbols-outlined">shield</span>
              </div>
            </div>
          </div>
        </div>
        {/* Detalhe atmosférico sutil */}
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <span className="material-symbols-outlined text-9xl">gavel</span>
        </div>
      </section>
    </main>
  );
}
