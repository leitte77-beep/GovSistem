"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api, MatterSummary } from "@/lib/api";
import { useOrg } from "@/lib/org-context";

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

  const doSearch = useCallback(
    (p?: { page?: number }) => {
      if (!query.trim()) return;
      setLoading(true);
      setSearched(true);
      const params: any = { q: query.trim() };
      if (actType) params.act_type = actType;
      if (orgUnit) params.org_unit = orgUnit;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (editionNo) params.edition = Number(editionNo);
      if (p?.page !== undefined) params.page = p.page;
      api.search(params).then((res) => {
        setResults(res.data);
        setTotal(res.pagination.total);
      }).catch(() => {}).finally(() => setLoading(false));
    },
    [query, actType, orgUnit, dateFrom, dateTo, editionNo],
  );

  useEffect(() => {
    if (sp.get("q")) {
      const urlQ = sp.get("q") || "";
      setQuery(urlQ);
      doSearch();
    }
  }, []);

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

  return (
    <main className="max-w-container-max mx-auto px-gutter py-stack-lg min-h-screen">
      {/* Hero Section */}
      <header className="mb-stack-lg border-l-4 border-primary pl-6">
        <h1 className="text-headline-lg font-headline-lg text-primary mb-stack-sm">
          Pesquisa Avançada
        </h1>
        <p className="text-body-lg font-body-lg text-on-surface-variant max-w-3xl">
          Encontre atos oficiais, decretos, portarias e publicações
          legislativas com precisão técnica em todo o acervo histórico
          {org?.name ? ` da(o) ${org.name}` : " do Diário Oficial"}.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-stack-lg items-start">
        {/* Search Form */}
        <section className="lg:col-span-8 bg-surface-container-lowest p-stack-lg rounded-xl shadow-sm border border-outline-variant">
          <form className="space-y-stack-md" onSubmit={handleSubmit}>
            {/* Keyword Search */}
            <div className="flex flex-col gap-2">
              <label className="text-label-md font-label-md text-primary" id="search-label">
                Termos de Pesquisa
              </label>
              <div className="relative">
                <input
                  className="w-full h-14 pl-12 pr-4 border border-outline rounded-lg text-body-md font-body-md outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                  placeholder="Digite palavras-chave, número do ato ou frase exata..."
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-labelledby="search-label"
                  aria-describedby="search-tips"
                />
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                  search
                </span>
              </div>
            </div>

            {/* Date Range & Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
              <div className="flex flex-col gap-2">
                <label htmlFor="date-from" className="text-label-md font-label-md text-primary">
                  Período de Publicação
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="date-from"
                    className="w-full h-12 border border-outline rounded-lg px-3 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span className="text-outline shrink-0">até</span>
                  <input
                    id="date-to"
                    className="w-full h-12 border border-outline rounded-lg px-3 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="act-type" className="text-label-md font-label-md text-primary">
                  Tipo de Ato
                </label>
                <select
                  id="act-type"
                  className="w-full h-12 border border-outline rounded-lg px-3 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all appearance-none bg-surface-container-lowest"
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-stack-md">
              <div className="flex flex-col gap-2">
                <label htmlFor="edition-no" className="text-label-md font-label-md text-primary">
                  Edição Nº
                </label>
                <input
                  id="edition-no"
                  className="w-full h-12 border border-outline rounded-lg px-3 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                  placeholder="Ex: 245"
                  type="text"
                  value={editionNo}
                  onChange={(e) => setEditionNo(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="page-no" className="text-label-md font-label-md text-primary">
                  Página
                </label>
                <input
                  id="page-no"
                  className="w-full h-12 border border-outline rounded-lg px-3 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                  placeholder="Ex: 12"
                  type="text"
                  value={pageNo}
                  onChange={(e) => setPageNo(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="org-unit" className="text-label-md font-label-md text-primary">
                  Órgão / Entidade
                </label>
                <input
                  id="org-unit"
                  className="w-full h-12 border border-outline rounded-lg px-3 text-body-sm font-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                  placeholder="Ex: Secretaria de Saúde"
                  type="text"
                  value={orgUnit}
                  onChange={(e) => setOrgUnit(e.target.value)}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-stack-sm pt-stack-sm">
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center justify-center gap-2 px-6 h-12 border border-primary text-primary font-bold rounded-lg hover:bg-primary-fixed transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">
                  filter_alt_off
                </span>
                Limpar Filtros
              </button>
              <button
                type="submit"
                className="flex items-center justify-center gap-2 px-8 h-12 bg-primary text-on-primary font-bold rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-md"
              >
                <span className="material-symbols-outlined text-[20px]">
                  search
                </span>
                Buscar Matérias
              </button>
            </div>
          </form>
        </section>

        {/* Tips Sidebar */}
        <aside className="lg:col-span-4 space-y-stack-md">
          <div className="bg-surface-container-high p-stack-md rounded-xl border border-outline-variant" id="search-tips">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <span className="material-symbols-outlined">lightbulb</span>
              <h3 className="text-headline-sm font-headline-sm">
                Dicas de Pesquisa
              </h3>
            </div>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <div className="mt-1 w-5 h-5 flex items-center justify-center bg-primary text-on-primary text-[10px] rounded-full shrink-0 font-bold">
                  1
                </div>
                <p className="text-body-sm font-body-sm">
                   Use <strong>aspas</strong> para buscar termos exatos. Ex:
                  &ldquo;Decreto Municipal&rdquo;.
                </p>
              </li>
              <li className="flex gap-3">
                <div className="mt-1 w-5 h-5 flex items-center justify-center bg-primary text-on-primary text-[10px] rounded-full shrink-0 font-bold">
                  2
                </div>
                <p className="text-body-sm font-body-sm">
                  Utilize o sinal de <strong>menos (-)</strong> para excluir
                  palavras. Ex: Nomeação -Exoneração.
                </p>
              </li>
              <li className="flex gap-3">
                <div className="mt-1 w-5 h-5 flex items-center justify-center bg-primary text-on-primary text-[10px] rounded-full shrink-0 font-bold">
                  3
                </div>
                <p className="text-body-sm font-body-sm">
                  Combine múltiplos filtros para restringir os resultados a
                  órgãos específicos.
                </p>
              </li>
            </ul>
          </div>

          {/* Digital Verification Teaser */}
          <Link
            href="/verificar"
            className="block relative overflow-hidden bg-primary text-on-primary p-stack-md rounded-xl shadow-lg group"
          >
            <div className="relative z-10">
              <h4 className="text-headline-sm font-headline-sm mb-2">
                Assinatura Digital
              </h4>
              <p className="text-body-sm font-body-sm opacity-90 mb-4">
                Todas as publicações são assinadas digitalmente para garantir
                autenticidade jurídica.
              </p>
              <span className="inline-flex items-center gap-2 bg-secondary-fixed text-on-secondary-fixed-variant px-4 py-2 rounded font-bold text-label-md group-hover:bg-secondary group-hover:text-on-secondary transition-colors">
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
        <section className="mt-stack-lg">
          <div className="flex items-center justify-between mb-stack-md">
            <h2 className="text-headline-sm font-headline-sm text-primary">
              Resultados da Pesquisa
            </h2>
            {!loading && (
              <span className="text-label-md font-label-md text-on-surface-variant">
                {total} resultado(s) encontrado(s)
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
                  className="block bg-surface-container-lowest border border-outline-variant rounded-xl p-5 hover:border-primary transition-all shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {m.act_type && (
                          <span className="text-label-sm font-label-sm text-primary bg-primary-fixed px-2 py-0.5 rounded">
                            {m.act_type}
                          </span>
                        )}
                        {m.org_unit && (
                          <span className="text-label-sm font-label-sm text-on-surface-variant">
                            {m.org_unit}
                          </span>
                        )}
                      </div>
                      <h3 className="font-headline-sm text-headline-sm text-primary truncate">
                        {m.title}
                      </h3>
                      {m.summary && (
                        <p className="text-body-sm font-body-sm text-on-surface-variant mt-1 line-clamp-2">
                          {m.summary}
                        </p>
                      )}
                      {m.publication_date && (
                        <p className="text-label-sm font-label-sm text-outline mt-2">
                          {formatDate(m.publication_date)}
                        </p>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-primary shrink-0">
                      chevron_right
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {!searched && !loading && (
        <section className="mt-stack-lg">
          <h3 className="text-headline-sm font-headline-sm text-primary mb-stack-md flex items-center gap-2">
            <span className="material-symbols-outlined">history</span>
            Pesquisas Recentes
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant hover:border-primary transition-colors cursor-pointer group"
              onClick={() => {
                setQuery("Licitações");
                doSearch();
              }}
            >
              <span className="text-label-md font-label-md text-outline group-hover:text-primary">
                Hoje
              </span>
              <p className="text-body-md font-body-md font-bold text-primary mt-1">
                Licitações
              </p>
            </div>
            <div
              className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant hover:border-primary transition-colors cursor-pointer group"
              onClick={() => {
                setQuery("Concursos");
                doSearch();
              }}
            >
              <span className="text-label-md font-label-md text-outline group-hover:text-primary">
                Ontem
              </span>
              <p className="text-body-md font-body-md font-bold text-primary mt-1">
                Concursos
              </p>
            </div>
            <div
              className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant hover:border-primary transition-colors cursor-pointer group"
              onClick={() => {
                setQuery("Portaria");
                doSearch();
              }}
            >
              <span className="text-label-md font-label-md text-outline group-hover:text-primary">
                15 Mai
              </span>
              <p className="text-body-md font-body-md font-bold text-primary mt-1">
                Portaria nº 250
              </p>
            </div>
            <div
              className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant hover:border-primary transition-colors cursor-pointer group"
              onClick={() => {
                setQuery("Decreto");
                doSearch();
              }}
            >
              <span className="text-label-md font-label-md text-outline group-hover:text-primary">
                12 Mai
              </span>
              <p className="text-body-md font-body-md font-bold text-primary mt-1">
                Decretos
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
