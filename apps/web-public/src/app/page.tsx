"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, EditionSummary as Edition } from "@/lib/api";
import { formatSummary } from "@/lib/summary";
import ShareDialog from "@/components/ShareDialog";

const TYPE_LABELS: Record<string, string> = {
  normal: "ORDINÁRIA",
  extra: "EXTRAORDINÁRIA",
  suplementar: "SUPLEMENTAR",
};

const TYPE_STYLES: Record<string, string> = {
  normal:
    "bg-secondary-container text-on-secondary-container",
  extra: "bg-primary-container text-on-primary-container",
  suplementar:
    "bg-tertiary-container text-on-tertiary-container",
};

const TYPE_BG: Record<string, string> = {
  normal: "bg-surface-container-low/30",
  extra: "bg-tertiary-container/10",
  suplementar: "bg-surface-container-low/30",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function HomePage() {
  const router = useRouter();
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNumber, setFilterNumber] = useState("");
  const [filterDate, setFilterDate] = useState("");

  useEffect(() => {
    api
      .listEditions({ page_size: 6 })
      .then((res) => setEditions(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (filterNumber.trim()) params.set("numero", filterNumber.trim());
      if (filterDate.trim()) params.set("data", filterDate.trim());
      router.push(`/buscar?${params.toString()}`);
    },
    [search, filterNumber, filterDate, router],
  );

  const displayed = editions.slice(0, 3);

  return (
    <>
      {/* Hero Section */}
      <section className="bg-surface py-stack-lg border-b border-outline-variant">
        <div className="max-w-container-max mx-auto px-gutter text-center">
          <h1 className="font-headline-lg text-headline-lg text-primary mb-stack-sm">
            Diário Oficial do Município de Farol
          </h1>
          <p className="text-body-lg font-body-lg text-on-surface-variant mb-stack-md max-w-2xl mx-auto">
            Acesse publicações oficiais, atos normativos e transparência
            governamental com facilidade e segurança jurídica.
          </p>

          <div className="bg-surface-container-lowest p-2 rounded-xl shadow-lg border border-outline-variant max-w-4xl mx-auto">
            <form
              onSubmit={handleSearch}
              className="flex flex-col md:flex-row gap-2"
            >
              <div className="flex-1 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-outline material-symbols-outlined">
                  search
                </span>
                <input
                  className="w-full pl-12 pr-4 py-4 bg-transparent border-0 focus:ring-0 text-body-md font-body-md placeholder:text-outline outline-none"
                  placeholder="Palavras-chave ou Termos..."
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap md:flex-nowrap gap-2 p-2 bg-surface-container-low rounded-lg">
                <div className="flex items-center gap-2 px-3 border-r border-outline-variant last:border-0">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    tag
                  </span>
                  <input
                    className="w-24 bg-transparent border-0 focus:ring-0 text-label-md font-label-md p-0 outline-none"
                    placeholder="Nº Edição"
                    type="text"
                    value={filterNumber}
                    onChange={(e) => setFilterNumber(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 px-3 border-r border-outline-variant last:border-0">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    calendar_today
                  </span>
                  <input
                    className="w-28 bg-transparent border-0 focus:ring-0 text-label-md font-label-md p-0 outline-none"
                    placeholder="Data"
                    type="text"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="bg-primary text-on-primary px-8 py-3 rounded-lg font-label-md text-label-md hover:opacity-90 transition-all flex items-center gap-2 shadow-md"
                >
                  BUSCAR
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Latest Editions Section */}
      <section className="py-stack-lg max-w-container-max mx-auto px-gutter">
        <div className="flex justify-between items-end mb-stack-md">
          <div>
            <h2 className="font-headline-md text-headline-md text-primary">
              Últimas Edições
            </h2>
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Publicações recentes do Diário Oficial da União
            </p>
          </div>
          <Link
            href="/edicoes"
            className="text-primary font-label-md text-label-md flex items-center gap-1 hover:underline"
          >
            Ver todas as edições{" "}
            <span className="material-symbols-outlined text-[16px]">
              arrow_forward
            </span>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-on-surface-variant">
            Carregando edições...
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            Nenhuma edição publicada
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
            {displayed.map((edition) => (
              <div
                key={edition.id}
                className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm flex flex-col hover:shadow-md transition-shadow duration-300"
              >
                <div
                  className={`p-6 border-b border-outline-variant ${
                    TYPE_BG[edition.type] || "bg-surface-container-low/30"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={`${
                        TYPE_STYLES[edition.type] || TYPE_STYLES.normal
                      } px-2 py-0.5 rounded text-[10px] font-bold tracking-wider`}
                    >
                      {TYPE_LABELS[edition.type] || TYPE_LABELS.normal}
                    </span>
                    <span className="text-label-md font-label-md text-on-surface-variant">
                      {formatDate(edition.publication_date)}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-primary leading-tight">
                    {edition.title}
                  </h3>
                </div>
                <div className="p-6 flex-grow">
                  <div className="mb-3 flex items-center gap-2 text-label-md font-label-md text-on-surface-variant uppercase tracking-widest">
                    <span className="h-px w-6 bg-secondary" />
                    Súmula do Dia
                  </div>
                  <div className="relative min-h-[116px] rounded-lg border border-outline-variant/70 bg-surface-container-low/45 px-4 py-3">
                    <p
                      className="text-body-sm font-body-sm text-on-surface leading-7"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {formatSummary(edition.daily_summary)}
                    </p>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-lg bg-gradient-to-t from-surface-container-low to-transparent" />
                  </div>
                </div>
                <div className="p-4 bg-surface-container-low flex items-center justify-between">
                  <Link
                    href={`/edicoes/${edition.year}/${edition.number}`}
                    className="bg-primary text-on-primary px-4 py-2 rounded-lg text-label-md font-label-md hover:opacity-90 transition-all"
                  >
                    Visualizar
                  </Link>
                  <div className="flex gap-1">
                    {edition.pdf_url && (
                      <a
                        href={edition.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-lg transition-colors"
                        title="Baixar PDF"
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
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transparency and Services Section */}
      <section className="bg-primary text-on-primary py-stack-lg">
        <div className="max-w-container-max mx-auto px-gutter">
          <div className="text-center mb-stack-md">
            <h2 className="font-headline-md text-headline-md">
              Transparência e Serviços
            </h2>
            <p className="text-body-md font-body-md text-on-primary-container">
              Ferramentas essenciais para garantir a autenticidade e o acesso à
              informação.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Service 1 - Verify */}
            <div className="bg-primary-container p-8 rounded-xl border border-on-primary-fixed-variant/20 hover:scale-[1.02] transition-transform duration-300">
              <div className="w-16 h-16 bg-secondary text-on-secondary rounded-full flex items-center justify-center mb-6 shadow-lg">
                <span
                  className="material-symbols-outlined text-[32px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified_user
                </span>
              </div>
              <h4 className="font-headline-sm text-headline-sm mb-2">
                Verificar Assinatura
              </h4>
              <p className="text-body-sm font-body-sm text-on-primary-container mb-6">
                Confirme a validade jurídica de documentos digitais através do
                nosso sistema de verificação ICP-Brasil.
              </p>
              <Link
                href="/verificar"
                className="text-secondary-fixed font-label-md text-label-md hover:underline flex items-center gap-2"
              >
                ACESSAR VALIDAR{" "}
                <span className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
              </Link>
            </div>

            {/* Service 2 - Archive */}
            <div className="bg-primary-container p-8 rounded-xl border border-on-primary-fixed-variant/20 hover:scale-[1.02] transition-transform duration-300">
              <div className="w-16 h-16 bg-primary-fixed text-on-primary-fixed rounded-full flex items-center justify-center mb-6 shadow-lg">
                <span
                  className="material-symbols-outlined text-[32px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  archive
                </span>
              </div>
              <h4 className="font-headline-sm text-headline-sm mb-2">
                Acervo Histórico
              </h4>
              <p className="text-body-sm font-body-sm text-on-primary-container mb-6">
                Pesquise em nossa base de dados histórica que contempla edições
                desde a fundação do Diário Oficial do Município.
              </p>
              <Link
                href="/acervo"
                className="text-secondary-fixed font-label-md text-label-md hover:underline flex items-center gap-2"
              >
                EXPLORAR ACERVO{" "}
                <span className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
              </Link>
            </div>

            {/* Service 3 - Legislation Search */}
            <div className="bg-primary-container p-8 rounded-xl border border-on-primary-fixed-variant/20 hover:scale-[1.02] transition-transform duration-300">
              <div className="w-16 h-16 bg-tertiary-fixed text-on-tertiary-fixed rounded-full flex items-center justify-center mb-6 shadow-lg">
                <span
                  className="material-symbols-outlined text-[32px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  gavel
                </span>
              </div>
              <h4 className="font-headline-sm text-headline-sm mb-2">
                Pesquisa Legislativa
              </h4>
              <p className="text-body-sm font-body-sm text-on-primary-container mb-6">
                Localize leis, decretos, portarias e normas por assunto, órgão
                emissor ou numeração específica.
              </p>
              <Link
                href="/buscar"
                className="text-secondary-fixed font-label-md text-label-md hover:underline flex items-center gap-2"
              >
                INICIAR PESQUISA{" "}
                <span className="material-symbols-outlined text-[16px]">
                  open_in_new
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter / Contact */}
      <section className="py-stack-lg bg-surface-container-low">
        <div className="max-w-container-max mx-auto px-gutter">
          <div className="flex flex-col lg:flex-row items-center gap-12 bg-surface-container-lowest p-10 rounded-2xl shadow-sm border border-outline-variant overflow-hidden relative">
            <div className="lg:w-1/2">
              <h2 className="font-headline-md text-headline-md text-primary mb-4">
                Mantenha-se Informado
              </h2>
              <p className="text-body-md font-body-md text-on-surface-variant mb-6">
                Assine nosso boletim informativo para receber os resumos
                diários das edições mais importantes diretamente em seu e-mail.
              </p>
              <form
                className="flex flex-col sm:flex-row gap-3"
                onSubmit={(e) => e.preventDefault()}
              >
                <input
                  className="flex-grow px-4 py-3 rounded-lg border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="seu@email.com"
                  type="email"
                />
                <button
                  type="submit"
                  className="bg-primary text-on-primary px-8 py-3 rounded-lg font-label-md text-label-md hover:shadow-lg transition-all"
                >
                  ASSINAR AGORA
                </button>
              </form>
              <p className="text-[11px] text-outline mt-4">
                Ao assinar, você concorda com nossa Política de Privacidade e
                Termos de Uso.
              </p>
            </div>
            <div className="lg:w-1/2 relative min-h-[300px] w-full rounded-xl overflow-hidden shadow-inner">
              <img
                alt="Institutional"
                className="absolute inset-0 w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDbkLKUPgGmqB36f1mghg52fm7xEC19nNAReJJ7tfQcBfkfT0dQ101PGlEHGIdDFQ4jsgxSHFMk_nREUOfWOqDRVIyIBZTzj4OGxqidtWFSXCgdQBA4cQmH6prCXK03HKoiEP9hHy_ZlAZuS_mwCHZq2Mh4iYddC7T-eWjSBG1V2yDJapd31x7KFYbxWqEtmZ1xrzPi-ly-GEot5a9lS1aJGBL_OBn8v-tgkdD7UE8pI9jDlGBT0-ZTlaIBhzZFlLRXSJBxPBS3VbYA"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
