"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api, MatterSummary } from "@/lib/api";
import { useOrg } from "@/lib/org-context";
import { notifyError } from "@/lib/error-handler";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16 text-on-surface-variant">Carregando...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00")).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function SearchPageContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { org } = useOrg();

  const [query, setQuery] = useState(sp.get("q") || "");
  const [dateFrom, setDateFrom] = useState(sp.get("date_from") || "");
  const [dateTo, setDateTo] = useState(sp.get("date_to") || "");
  const [actType, setActType] = useState(sp.get("act_type") || "");
  const [editionNo, setEditionNo] = useState(sp.get("edition") || "");
  const [pageNo, setPageNo] = useState(sp.get("page") || "");
  const [orgUnit, setOrgUnit] = useState(sp.get("org_unit") || "");

  const [results, setResults] = useState<MatterSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const initialSearchDone = useRef(false);

  const doSearch = useCallback(
    (p?: { page?: number; query?: string }) => {
      const searchTerm = p?.query ?? query;
      if (!searchTerm.trim()) return;
      setLoading(true);
      setSearched(true);
      const params: any = { q: searchTerm.trim() };
      if (actType) params.act_type = actType;
      if (orgUnit) params.org_unit = orgUnit;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (editionNo) params.edition = Number(editionNo);
      if (p?.page !== undefined) params.page = p.page;
      api.search(params).then((res) => {
        setResults(res.data);
        setTotal(res.pagination.total);
      }).catch((err) => notifyError("Buscar", err)).finally(() => setLoading(false));
    },
    [query, actType, orgUnit, dateFrom, dateTo, editionNo],
  );

  useEffect(() => {
    if (initialSearchDone.current) return;
    initialSearchDone.current = true;
    if (sp.get("q")) {
      const urlQ = sp.get("q") || "";
      setQuery(urlQ);
      doSearch({ query: urlQ });
    }
  }, [doSearch, sp]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (actType) params.set("act_type", actType);
    if (orgUnit) params.set("org_unit", orgUnit);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (editionNo) params.set("edition", editionNo);
    if (pageNo) params.set("page", pageNo);
    router.push(`/buscar?${params.toString()}`);
    doSearch();
  };

  const handleReset = () => {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setActType("");
    setEditionNo("");
    setPageNo("");
    setOrgUnit("");
    setResults([]);
    setSearched(false);
    router.push("/buscar");
  };

  const runQuickSearch = (term: string) => {
    setQuery(term);
    router.push(`/buscar?q=${encodeURIComponent(term)}`);
    doSearch({ query: term });
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <header className="relative overflow-hidden bg-[#071a33] text-white">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative mx-auto max-w-[1240px] px-4 pb-28 pt-14 sm:px-6 lg:px-8 lg:pb-32 lg:pt-16">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300"><span className="h-px w-7 bg-emerald-400" /> Consulta ao acervo</p>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">Pesquisa avançada</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Localize atos oficiais, decretos e portarias em todo o histórico{org?.name ? ` de ${org.name}` : " do Diário Oficial"}.
          </p>
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-16 grid max-w-[1240px] grid-cols-1 items-start gap-5 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        {/* Search Form */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(7,26,51,.14)] sm:p-7 lg:col-span-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Keyword Search */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600" id="search-label">
                O que você procura?
              </label>
              <div className="group relative rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-accent">
                <input
                  className="h-14 w-full border-0 bg-transparent pl-12 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                  placeholder="Digite palavras-chave, número do ato ou frase exata..."
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-labelledby="search-label"
                  aria-describedby="search-tips"
                />
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[21px] text-slate-400 group-focus-within:text-brand-accent">
                  search
                </span>
              </div>
            </div>

            {/* Date Range & Type */}
            <div className="grid grid-cols-1 gap-5 border-t border-slate-100 pt-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="date-from" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">
                  Período de Publicação
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="date-from"
                    className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-blue-100"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span className="shrink-0 text-xs text-slate-400">até</span>
                  <input
                    id="date-to"
                    className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-blue-100"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="act-type" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">
                  Tipo de Ato
                </label>
                <select
                  id="act-type"
                  className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-blue-100"
                  value={actType}
                  onChange={(e) => setActType(e.target.value)}
                >
                  <option value="">Todos os tipos</option>
                  <option value="Decreto">Decreto</option>
                  <option value="Portaria">Portaria</option>
                  <option value="Lei">Lei</option>
                  <option value="Edital">Edital</option>
                  <option value="Resolução">Resolução</option>
                  <option value="Instrução Normativa">Instrução Normativa</option>
                </select>
              </div>
            </div>

            {/* Specific Fields */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="edition-no" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">
                  Edição Nº
                </label>
                <input
                  id="edition-no"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-blue-100"
                  placeholder="Ex: 245"
                  type="text"
                  value={editionNo}
                  onChange={(e) => setEditionNo(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="page-no" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">
                  Página
                </label>
                <input
                  id="page-no"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-blue-100"
                  placeholder="Ex: 12"
                  type="text"
                  value={pageNo}
                  onChange={(e) => setPageNo(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="org-unit" className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">
                  Órgão / Entidade
                </label>
                <input
                  id="org-unit"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none placeholder:text-slate-400 focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-blue-100"
                  placeholder="Ex: Secretaria de Saúde"
                  type="text"
                  value={orgUnit}
                  onChange={(e) => setOrgUnit(e.target.value)}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col justify-end gap-2 border-t border-slate-100 pt-5 sm:flex-row">
              <button
                type="button"
                onClick={handleReset}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-6 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-brand-900"
              >
                <span className="material-symbols-outlined text-[20px]">
                  filter_alt_off
                </span>
                Limpar filtros
              </button>
              <button
                type="submit"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-900 px-8 text-xs font-bold text-white shadow-[0_8px_20px_rgba(11,25,44,.18)] transition hover:-translate-y-px hover:bg-brand-800"
              >
                <span className="material-symbols-outlined text-[20px]">
                  search
                </span>
                Buscar publicações
              </button>
            </div>
          </form>
        </section>

        {/* Tips Sidebar */}
        <aside className="space-y-5 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_28px_rgba(15,42,82,.05)]" id="search-tips">
            <div className="mb-5 flex items-center gap-3 text-brand-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><span className="material-symbols-outlined text-[20px]">lightbulb</span></span>
              <h3 className="text-base font-bold">
                Dicas de pesquisa
              </h3>
            </div>
            <ul className="space-y-5">
              <li className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[10px] font-bold text-brand-900">
                  1
                </div>
                <p className="text-xs leading-5 text-slate-600">
                   Use <strong>aspas</strong> para buscar termos exatos. Ex:
                  &ldquo;Decreto Municipal&rdquo;.
                </p>
              </li>
              <li className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[10px] font-bold text-brand-900">
                  2
                </div>
                <p className="text-xs leading-5 text-slate-600">
                  Utilize o sinal de <strong>menos (-)</strong> para excluir
                  palavras. Ex: Nomeação -Exoneração.
                </p>
              </li>
              <li className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[10px] font-bold text-brand-900">
                  3
                </div>
                <p className="text-xs leading-5 text-slate-600">
                  Combine múltiplos filtros para restringir os resultados a
                  órgãos específicos.
                </p>
              </li>
            </ul>
          </div>

          {/* Digital Verification Teaser */}
          <Link
            href="/verificar"
            className="group relative block overflow-hidden rounded-2xl bg-[#071a33] p-6 text-white shadow-[0_16px_35px_rgba(7,26,51,.16)]"
          >
            <div className="relative z-10">
              <h4 className="mb-2 text-lg font-bold">
                Autenticidade digital
              </h4>
              <p className="mb-5 text-xs leading-5 text-slate-300">
                Todas as publicações são assinadas digitalmente para garantir
                autenticidade jurídica.
              </p>
              <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-bold text-brand-900 transition group-hover:bg-emerald-300">
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified
                </span>
                Verificar Documento
              </span>
            </div>
            <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <span className="material-symbols-outlined text-[120px]">
                verified_user
              </span>
            </div>
          </Link>
        </aside>
      </div>

      {/* Results */}
      {searched && (
        <section className="mx-auto max-w-[1240px] px-4 pb-20 pt-12 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Acervo encontrado</p>
              <h2 className="text-xl font-extrabold text-brand-900">
                Resultados da pesquisa
              </h2>
            </div>
            {!loading && (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500">
                {total} {total === 1 ? "resultado" : "resultados"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-3">
              <span className="material-symbols-outlined text-4xl animate-spin">
                hourglass_empty
              </span>
              <span>Buscando...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl mb-4 block">
                search_off
              </span>
              Nenhum resultado encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((m) => (
                <Link
                  key={m.id}
                  href={`/materias/${m.id}`}
                  className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_22px_rgba(15,42,82,.045)] transition hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-[0_12px_30px_rgba(15,42,82,.08)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {m.act_type && (
                          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-900 ring-1 ring-inset ring-brand-100">
                            {m.act_type}
                          </span>
                        )}
                        {m.org_unit && (
                          <span className="text-xs font-semibold text-slate-500">
                            {m.org_unit}
                          </span>
                        )}
                      </div>
                      <h3 className="truncate text-base font-bold text-brand-900">
                        {m.title}
                      </h3>
                      {m.summary && (
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                          {m.summary}
                        </p>
                      )}
                      {m.publication_date && (
                        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                          <span className="material-symbols-outlined text-[15px]">calendar_month</span>
                          {formatDate(m.publication_date)}
                        </p>
                      )}
                    </div>
                    <span className="material-symbols-outlined shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-accent">
                      arrow_forward
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {!searched && !loading && (
        <section className="mx-auto max-w-[1240px] px-4 pb-20 pt-12 sm:px-6 lg:px-8">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-brand-900">
            <span className="material-symbols-outlined text-[20px] text-brand-accent">bolt</span>
            Sugestões de pesquisa
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <button
              type="button"
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-100 hover:bg-brand-50"
              onClick={() => runQuickSearch("Licitações")}
            >
              <span className="text-sm font-bold text-brand-900">Licitações</span><span className="material-symbols-outlined text-[17px] text-slate-300 group-hover:text-brand-accent">arrow_forward</span>
            </button>
            <button
              type="button"
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-100 hover:bg-brand-50"
              onClick={() => runQuickSearch("Concursos")}
            >
              <span className="text-sm font-bold text-brand-900">Concursos</span><span className="material-symbols-outlined text-[17px] text-slate-300 group-hover:text-brand-accent">arrow_forward</span>
            </button>
            <button
              type="button"
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-100 hover:bg-brand-50"
              onClick={() => runQuickSearch("Portaria")}
            >
              <span className="text-sm font-bold text-brand-900">Portarias</span><span className="material-symbols-outlined text-[17px] text-slate-300 group-hover:text-brand-accent">arrow_forward</span>
            </button>
            <button
              type="button"
              className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-100 hover:bg-brand-50"
              onClick={() => runQuickSearch("Decreto")}
            >
              <span className="text-sm font-bold text-brand-900">Decretos</span><span className="material-symbols-outlined text-[17px] text-slate-300 group-hover:text-brand-accent">arrow_forward</span>
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
