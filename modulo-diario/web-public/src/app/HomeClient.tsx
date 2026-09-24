"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, EditionSummary as Edition } from "@/lib/api";
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
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export interface Props {
  initialEditions: Edition[];
}

export default function HomeClient({ initialEditions }: Props) {
  const router = useRouter();
  const { org } = useOrg();
  const [editions, setEditions] = useState<Edition[]>(initialEditions);
  const [loading, setLoading] = useState(initialEditions.length === 0);
  const [search, setSearch] = useState("");
  const [filterNumber, setFilterNumber] = useState("");
  const [filterDate, setFilterDate] = useState("");

  useEffect(() => {
    if (initialEditions.length > 0) return;
    api
      .listEditions({ page_size: 6 })
      .then((res) => setEditions(res.data))
      .catch((err) => notifyError("HomeClient", err))
      .finally(() => setLoading(false));
  }, [initialEditions]);

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
      <section className="relative overflow-hidden bg-[#071a33] text-white">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div aria-hidden="true" className="absolute -right-24 -top-32 h-96 w-96 rounded-full border-[70px] border-white/[0.025]" />
        <div className="relative mx-auto max-w-[1440px] px-4 pb-32 pt-16 sm:px-6 sm:pt-20 lg:px-8 lg:pb-36">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.12)]" />
              Portal oficial de publicações
            </div>
            <h1 className="text-4xl font-extrabold tracking-[-0.035em] sm:text-5xl lg:text-[58px] lg:leading-[1.06]">
              Diário Oficial <span className="text-blue-300">Eletrônico</span>
            </h1>
            <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-white/65 sm:text-base">
              {org?.name || "Administração pública municipal"}
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Consulte atos oficiais, acompanhe as edições mais recentes e valide documentos com segurança.
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-20 max-w-5xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_22px_60px_rgba(7,26,51,0.18)] sm:p-4">
          <div className="mb-3 flex items-center justify-between px-1 sm:px-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Pesquisar no Diário Oficial</p>
            <Link href="/buscar" className="hidden text-xs font-semibold text-brand-accent hover:underline sm:block">Pesquisa avançada</Link>
          </div>
          <form onSubmit={handleSearch} className="flex flex-col gap-2 lg:flex-row">
              <div className="group relative flex-1 rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-accent">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[22px] text-slate-400 transition group-focus-within:text-brand-accent">search</span>
                <input
                  className="h-14 w-full border-0 bg-transparent pl-12 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                  placeholder="Busque por assunto, órgão, portaria, decreto..."
                  type="text"
                  aria-label="Termos da pesquisa"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0">
                <label className="flex h-14 items-center gap-2 rounded-xl bg-slate-50 px-4 ring-1 ring-inset ring-slate-200 focus-within:ring-2 focus-within:ring-brand-accent">
                  <span className="material-symbols-outlined text-[19px] text-brand-900">tag</span>
                  <input
                    className="w-full min-w-0 border-0 bg-transparent p-0 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-slate-400 focus:ring-0 lg:w-24"
                    placeholder="Nº da edição"
                    type="text"
                    inputMode="numeric"
                    aria-label="Número da edição"
                    value={filterNumber}
                    onChange={(e) => setFilterNumber(e.target.value)}
                  />
                </label>
                <label className="flex h-14 items-center gap-2 rounded-xl bg-slate-50 px-4 ring-1 ring-inset ring-slate-200 focus-within:ring-2 focus-within:ring-brand-accent">
                  <span className="material-symbols-outlined text-[19px] text-brand-900">calendar_today</span>
                  <input
                    className="w-full min-w-0 border-0 bg-transparent p-0 text-sm font-semibold text-slate-700 outline-none focus:ring-0 lg:w-32"
                    type="date"
                    aria-label="Data da publicação"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="col-span-2 inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-900 px-7 text-sm font-bold text-white shadow-[0_8px_20px_rgba(11,25,44,.18)] transition hover:-translate-y-px hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
                >
                  <span className="material-symbols-outlined text-[19px]">search</span>
                  Buscar publicações
                </button>
              </div>
          </form>
        </div>
      </div>

      {/* Latest Editions */}
      <section className="mx-auto max-w-[1240px] px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pt-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Atualizações oficiais</p>
            <h2 className="text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">Últimas edições</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Publicações mais recentes{org?.name ? ` de ${org.name}` : ""}
            </p>
          </div>
          <Link href="/edicoes" className="group flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-brand-900 shadow-sm transition hover:border-brand-100 hover:bg-brand-50">
            Ver todas <span className="material-symbols-outlined text-[17px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-on-surface-variant">Carregando edições...</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">Nenhuma edição publicada</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {displayed.map((edition) => (
              <article key={edition.id} className="group relative flex min-h-[340px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,42,82,0.06)] transition duration-300 hover:-translate-y-1 hover:border-brand-100 hover:shadow-[0_18px_42px_rgba(15,42,82,0.12)]">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-900 via-brand-accent to-emerald-500 opacity-80" />
                <div className="relative overflow-hidden bg-gradient-to-br from-brand-50/80 via-white to-blue-50/40 p-6 pb-5">
                  <div aria-hidden="true" className="absolute -right-8 -top-9 h-28 w-28 rounded-full border-[20px] border-brand-100/25" />
                  <div className="relative mb-5 flex items-center justify-between gap-3">
                    <span className={`${TYPE_STYLES[edition.type] || TYPE_STYLES.normal} rounded-full border px-2.5 py-1 text-[9px] font-extrabold tracking-[0.12em]`}>
                      {TYPE_LABELS[edition.type] || TYPE_LABELS.normal}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <span className="material-symbols-outlined text-[15px]">calendar_month</span>
                      {formatDate(edition.publication_date)}
                    </span>
                  </div>
                  <div className="relative flex items-start gap-3">
                    <span aria-hidden="true" className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900 text-white shadow-[0_6px_14px_rgba(11,25,44,.18)]">
                      <span className="material-symbols-outlined text-[21px]">newspaper</span>
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-accent">Diário Oficial</p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h3 className="text-[22px] font-extrabold leading-tight tracking-[-0.025em] text-brand-900">Edição nº {edition.number}</h3>
                        <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-inset ring-slate-200">{edition.year}</span>
                      </div>
                      <span className="sr-only">{edition.title}</span>
                    </div>
                  </div>
                </div>
                <div className="mx-6 h-px bg-slate-100" />
                <div className="flex flex-1 flex-col px-6 py-5">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Resumo desta edição</p>
                  <div className="relative flex-1">
                    <p className="text-sm leading-6 text-slate-700" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {formatSummary(edition.daily_summary)}
                    </p>
                  </div>
                  <div className="mt-5 flex items-center gap-4 text-[11px] font-semibold text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-brand-accent">description</span>{edition.item_count} {edition.item_count === 1 ? "publicação" : "publicações"}</span>
                    {edition.signature_count > 0 && <span className="flex items-center gap-1.5 text-emerald-700"><span className="material-symbols-outlined text-[16px]">verified</span>Assinada</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 p-4 pl-6">
                  <Link href={`/edicoes/${edition.year}/${edition.number}`} className="group/link flex items-center gap-2 text-sm font-bold text-brand-900">
                    Consultar edição <span className="material-symbols-outlined text-[18px] transition-transform group-hover/link:translate-x-0.5">arrow_forward</span>
                  </Link>
                  <div className="flex gap-1">
                    {edition.pdf_url && (
                      <a href={edition.pdf_url} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-brand-900 hover:shadow-sm" aria-label="Baixar PDF">
                        <span className="material-symbols-outlined text-[19px]">download</span>
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
        )}
      </section>

      {/* Transparency */}
      <section className="bg-[#071a33] py-20 text-white">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-400">Acesso e confiança</p>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Transparência e serviços</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">Ferramentas para consultar o acervo público e confirmar a autenticidade de cada documento.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { icon: "verified_user", title: "Verificar Assinatura", desc: "Confirme a validade jurídica de documentos digitais através do nosso sistema de verificação ICP-Brasil.", href: "/verificar", label: "ACESSAR VALIDADOR" },
              { icon: "archive", title: "Acervo Histórico", desc: "Pesquise em nossa base de dados histórica que contempla edições desde a primeira edição do Diário Oficial.", href: "/acervo", label: "EXPLORAR ACERVO" },
              { icon: "gavel", title: "Pesquisa Legislativa", desc: "Localize leis, decretos, portarias e normas por assunto, órgão emissor ou numeração específica.", href: "/buscar", label: "INICIAR PESQUISA" },
            ].map((svc) => (
              <div key={svc.href} className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.055] p-7 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08]">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-blue-200 ring-1 ring-inset ring-white/10">
                  <span className="material-symbols-outlined text-[25px]">{svc.icon}</span>
                </div>
                <h3 className="mb-2 text-lg font-bold">{svc.title}</h3>
                <p className="mb-7 flex-1 text-sm leading-6 text-slate-300">{svc.desc}</p>
                <Link href={svc.href} className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  {svc.label} <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white px-6 py-10 shadow-[0_16px_50px_rgba(15,42,82,.08)] sm:px-10 lg:px-14">
            <div aria-hidden="true" className="absolute bottom-0 right-0 h-48 w-48 translate-x-12 translate-y-12 rounded-full border-[38px] border-brand-50" />
            <div className="relative max-w-3xl">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Boletim oficial</p>
              <h2 className="mb-3 text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">Receba as novas edições</h2>
              <p className="mb-6 max-w-2xl text-sm leading-6 text-slate-600">Acompanhe as publicações oficiais do município diretamente em seu e-mail.</p>
              <form className="flex max-w-2xl flex-col gap-3 sm:flex-row" onSubmit={(e) => e.preventDefault()}>
                <input className="h-12 flex-grow rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-brand-accent focus:bg-white focus:ring-2 focus:ring-blue-100" placeholder="seu@email.com" type="email" />
                <button type="submit" className="h-12 rounded-xl bg-brand-900 px-7 text-xs font-bold text-white transition hover:bg-brand-800">Assinar boletim</button>
              </form>
              <p className="mt-3 text-[10px] text-slate-400">Ao assinar, você concorda com nossa Política de Privacidade.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
