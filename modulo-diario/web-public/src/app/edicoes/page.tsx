"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  extra: "border-blue-200 bg-blue-50 text-blue-700",
  suplementar: "border-amber-200 bg-amber-50 text-amber-700",
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

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TYPE_OPTIONS = [
  { value: "normal", label: "Ordinária" },
  { value: "extra", label: "Extraordinária" },
  { value: "suplementar", label: "Suplementar" },
];

interface Filters {
  search: string;
  year: string;
  month: string;
  act: string;
  type: string;
  number: string;
  dateFrom: string;
  dateTo: string;
  order: "desc" | "asc";
}

const EMPTY_FILTERS: Filters = {
  search: "", year: "", month: "", act: "", type: "",
  number: "", dateFrom: "", dateTo: "", order: "desc",
};

const fieldClass =
  "h-11 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm text-slate-800 outline-none ring-1 ring-inset ring-slate-200 focus:bg-white focus:ring-2 focus:ring-brand-accent";
const labelClass = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600";

function formatChipDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function EditionsPage() {
  const { org } = useOrg();
  const [editions, setEditions] = useState<EditionSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  // `draft` é o que está nos campos; `filters` é o que já foi aplicado à lista.
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showMore, setShowMore] = useState(false);
  const [years, setYears] = useState<{ year: number; count: number }[]>([]);
  const [acts, setActs] = useState<{ key: string; label: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 12;

  useEffect(() => {
    api.listEditionYears().then(setYears).catch((err) => notifyError("EdicoesPublic", err));
    api.listEditionActFilters().then(setActs).catch((err) => notifyError("EdicoesPublic", err));
  }, []);

  const fetchEditions = useCallback(() => {
    setLoading(true);
    api
      .listEditions({
        search: filters.search.trim() || undefined,
        year: filters.year ? Number(filters.year) : undefined,
        month: filters.month ? Number(filters.month) : undefined,
        act: filters.act || undefined,
        type: filters.type || undefined,
        number: filters.number ? Number(filters.number) : undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        order: filters.order,
        page,
        page_size: pageSize,
      })
      .then((res) => {
        setEditions(res.data);
        setPagination(res.pagination);
      })
      .catch((err) => notifyError("EdicoesPublic", err))
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => {
    fetchEditions();
  }, [fetchEditions]);

  const apply = (next: Filters) => {
    setDraft(next);
    setFilters(next);
    setPage(0);
  };

  // Listas (ano, mês, ato, tipo, ordem) aplicam na hora; campos digitados no "Filtrar".
  const applyNow = (patch: Partial<Filters>) => apply({ ...draft, ...patch });

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    apply(draft);
  };

  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (filters.search.trim()) chips.push({ key: "search", label: `“${filters.search.trim()}”`, clear: { search: "" } });
  if (filters.act) chips.push({ key: "act", label: acts.find((a) => a.key === filters.act)?.label ?? filters.act, clear: { act: "" } });
  if (filters.year) chips.push({ key: "year", label: `Ano ${filters.year}`, clear: { year: "" } });
  if (filters.month) chips.push({ key: "month", label: MONTHS[Number(filters.month) - 1], clear: { month: "" } });
  if (filters.type) chips.push({ key: "type", label: TYPE_OPTIONS.find((t) => t.value === filters.type)?.label ?? filters.type, clear: { type: "" } });
  if (filters.number) chips.push({ key: "number", label: `Edição nº ${filters.number}`, clear: { number: "" } });
  if (filters.dateFrom || filters.dateTo) {
    const de = filters.dateFrom ? `de ${formatChipDate(filters.dateFrom)}` : "";
    const ate = filters.dateTo ? `até ${formatChipDate(filters.dateTo)}` : "";
    chips.push({ key: "period", label: [de, ate].filter(Boolean).join(" "), clear: { dateFrom: "", dateTo: "" } });
  }
  const advancedCount = [filters.month, filters.type, filters.number, filters.dateFrom || filters.dateTo].filter(Boolean).length;

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
    <main className="min-h-screen bg-slate-50">
      {/* Title Section */}
      <section className="relative overflow-hidden bg-[#071a33] text-white">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative mx-auto max-w-[1240px] px-4 pb-28 pt-14 sm:px-6 lg:px-8 lg:pb-32 lg:pt-16">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-px w-7 bg-emerald-400" /> Acervo público
          </p>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">Edições publicadas</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Consulte o histórico de atos oficiais e decisões administrativas{org?.name ? ` de ${org.name}` : " do município"}.
          </p>
        </div>
      </section>

      {/* Search & Filter Bar */}
      <section className="relative z-10 mx-auto -mt-16 max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_55px_rgba(7,26,51,.16)] sm:p-4">
          <form onSubmit={handleFilter}>
            <div className="flex flex-col gap-2 lg:flex-row">
              <div className="group relative w-full flex-grow rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-accent">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[21px] text-slate-500 group-focus-within:text-brand-accent">
                  search
                </span>
                <input
                  className="h-14 w-full border-0 bg-transparent pl-12 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-500 focus:ring-0"
                  placeholder="Busque por título, assunto, nº do ato ou palavra-chave..."
                  type="search"
                  aria-label="Pesquisar edições"
                  value={draft.search}
                  onChange={(e) => setDraft({ ...draft, search: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 lg:flex">
                <div className="relative lg:w-52">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-brand-900">
                    gavel
                  </span>
                  <select
                    aria-label="Filtrar por tipo de ato"
                    className="h-14 w-full cursor-pointer appearance-none truncate rounded-xl border-0 bg-slate-50 pl-11 pr-9 text-sm font-semibold text-slate-700 outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-brand-accent"
                    value={draft.act}
                    onChange={(e) => applyNow({ act: e.target.value })}
                  >
                    <option value="">Todos os atos</option>
                    {acts.map((a) => (
                      <option key={a.key} value={a.key} disabled={a.count === 0}>
                        {a.label} ({a.count.toLocaleString("pt-BR")})
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-500">expand_more</span>
                </div>
                <div className="relative lg:w-44">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-brand-900">
                    calendar_today
                  </span>
                  <select
                    aria-label="Filtrar por ano"
                    className="h-14 w-full cursor-pointer appearance-none rounded-xl border-0 bg-slate-50 pl-11 pr-9 text-sm font-semibold text-slate-700 outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-brand-accent"
                    value={draft.year}
                    onChange={(e) => applyNow({ year: e.target.value })}
                  >
                    <option value="">Todos os anos</option>
                    {years.map((y) => (
                      <option key={y.year} value={y.year}>
                        {y.year} ({y.count.toLocaleString("pt-BR")})
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-500">expand_more</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  aria-expanded={showMore}
                  aria-controls="filtros-avancados"
                  className={`flex h-14 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-inset transition ${
                    showMore || advancedCount
                      ? "bg-brand-50 text-brand-900 ring-brand-100"
                      : "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">tune</span>
                  Mais filtros
                  {advancedCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-900 px-1.5 text-[11px] font-bold text-white">
                      {advancedCount}
                    </span>
                  )}
                </button>
                <button
                  type="submit"
                  className="flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-900 px-7 text-sm font-bold text-white shadow-[0_8px_20px_rgba(11,25,44,.18)] transition hover:-translate-y-px hover:bg-brand-800"
                >
                  <span className="material-symbols-outlined text-[18px]">search</span> Buscar
                </button>
              </div>
            </div>

            {showMore && (
              <div
                id="filtros-avancados"
                className="mt-3 grid grid-cols-1 gap-4 border-t border-slate-100 px-1 pb-1 pt-4 sm:grid-cols-2 lg:grid-cols-5"
              >
                <div>
                  <label htmlFor="f-mes" className={labelClass}>Mês</label>
                  <select id="f-mes" className={fieldClass} value={draft.month} onChange={(e) => applyNow({ month: e.target.value })}>
                    <option value="">Todos</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-tipo" className={labelClass}>Tipo de edição</label>
                  <select id="f-tipo" className={fieldClass} value={draft.type} onChange={(e) => applyNow({ type: e.target.value })}>
                    <option value="">Todas</option>
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-numero" className={labelClass}>Nº da edição</label>
                  <input
                    id="f-numero"
                    className={fieldClass}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="Ex.: 203"
                    value={draft.number}
                    onChange={(e) => setDraft({ ...draft, number: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="f-de" className={labelClass}>Publicadas de</label>
                  <input
                    id="f-de"
                    className={fieldClass}
                    type="date"
                    value={draft.dateFrom}
                    max={draft.dateTo || undefined}
                    onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="f-ate" className={labelClass}>Até</label>
                  <input
                    id="f-ate"
                    className={fieldClass}
                    type="date"
                    value={draft.dateTo}
                    min={draft.dateFrom || undefined}
                    onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
                  />
                </div>
              </div>
            )}
          </form>

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 px-1 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">Filtros:</span>
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => apply({ ...filters, ...c.clear })}
                  aria-label={`Remover filtro ${c.label}`}
                  className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-brand-900 ring-1 ring-inset ring-brand-100 transition hover:bg-brand-100"
                >
                  {c.label}
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => apply({ ...EMPTY_FILTERS, order: filters.order })}
                className="ml-1 text-xs font-semibold text-slate-600 underline-offset-2 hover:text-brand-900 hover:underline"
              >
                Limpar tudo
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 pb-20 pt-10 sm:px-6 lg:px-8">
      {/* Results Counter + Sort */}
      <div className="mb-5 flex items-center justify-between gap-3 px-1">
        <span className="text-xs font-semibold text-slate-600" aria-live="polite">
          Mostrando {editions.length} de{" "}
          {pagination?.total != null ? pagination.total.toLocaleString("pt-BR") : "..."}{" "}
          edições
        </span>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">sort</span>
          <span className="sr-only">Ordenar</span>
          <select
            className="cursor-pointer rounded-md border-0 bg-transparent py-1 pl-1 pr-7 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-brand-accent"
            value={filters.order}
            onChange={(e) => applyNow({ order: e.target.value as Filters["order"] })}
          >
            <option value="desc">Mais recentes primeiro</option>
            <option value="asc">Mais antigas primeiro</option>
          </select>
        </label>
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
          {chips.length > 0 && (
            <button
              type="button"
              onClick={() => apply({ ...EMPTY_FILTERS, order: filters.order })}
              className="mt-3 block w-full text-sm font-semibold text-brand-900 underline underline-offset-2"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Vertical Editions List */}
          <div className="flex flex-col gap-4">
            {editions.map((edition) => (
              <article
                key={edition.id}
                className="group relative grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_7px_24px_rgba(15,42,82,.045)] transition duration-300 hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-[0_14px_34px_rgba(15,42,82,.09)] md:grid-cols-[250px_minmax(0,1fr)_170px]"
              >
                <div aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-brand-900 via-brand-accent to-emerald-500" />
                <div className="relative flex flex-col overflow-hidden border-b border-slate-100 bg-gradient-to-br from-brand-50/75 via-white to-blue-50/30 p-6 pl-7 md:border-b-0 md:border-r">
                  <div aria-hidden="true" className="absolute -right-8 -top-8 h-24 w-24 rounded-full border-[18px] border-brand-100/25" />
                  <div
                    className={`relative mb-5 inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-extrabold tracking-[0.12em] ${
                      TYPE_STYLES[edition.type] || TYPE_STYLES.normal
                    }`}
                  >
                    {TYPE_LABELS[edition.type] || TYPE_LABELS.normal}
                  </div>
                  <div className="relative flex items-start gap-3">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-900 text-white shadow-sm">
                      <span className="material-symbols-outlined text-[19px]">newspaper</span>
                    </span>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-accent">Diário Oficial</p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-2">
                        <h2 className="text-xl font-extrabold leading-tight tracking-[-0.025em] text-brand-900">Edição nº {edition.number}</h2>
                        <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-inset ring-slate-200">{edition.year}</span>
                      </div>
                    </div>
                  </div>
                  <time className="relative mt-4 flex items-center gap-1.5 text-[11px] leading-5 text-slate-600">
                    <span className="material-symbols-outlined text-[15px] text-slate-500">calendar_month</span>
                    {formatDate(edition.publication_date)}
                  </time>
                </div>

                <div className="min-w-0 p-6">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Resumo da edição
                  </h3>
                  <ul>
                    <li className="text-sm leading-6 text-slate-700" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {formatSummary(edition.daily_summary)}
                    </li>
                  </ul>
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-brand-accent">description</span>{edition.item_count} {edition.item_count === 1 ? "publicação" : "publicações"}</span>
                    <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-slate-500">calendar_month</span>{formatShortDate(edition.publication_date)}</span>
                    {edition.signature_count > 0 && <span className="flex items-center gap-1.5 text-emerald-700"><span className="material-symbols-outlined text-[16px]">verified</span>Assinada digitalmente</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 md:flex-col md:justify-center md:border-l md:border-t-0 md:px-5">
                  <Link
                    href={`/edicoes/${edition.year}/${edition.number}`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-800"
                  >
                    Consultar <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
                  </Link>
                  <div className="flex gap-2">
                    {edition.pdf_url && (
                      <a
                        href={edition.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-100 hover:text-brand-900"
                        aria-label="Baixar PDF"
                      >
                        <span className="material-symbols-outlined text-[19px]">
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
      <aside className="mt-14 overflow-hidden rounded-2xl bg-[#071a33] p-7 text-white shadow-[0_18px_45px_rgba(7,26,51,.15)] sm:p-9">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex max-w-2xl items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
              <span className="material-symbols-outlined">verified_user</span>
            </span>
            <div>
              <h2 className="text-xl font-bold">Publicações com autenticidade verificável</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Consulte o código de cada edição para confirmar sua assinatura e integridade digital.</p>
            </div>
          </div>
          <Link href="/verificar" className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-bold text-brand-900 transition hover:bg-blue-50">
            Verificar documento <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
          </Link>
        </div>
      </aside>
      </div>
    </main>
  );
}
