import Link from "next/link";
import PrintButton from "./PrintButton";
import { LEGAL_DOCS, LEGAL_INFO, type LegalDocSlug } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LegalShellProps {
  slug: LegalDocSlug;
  title: string;
  intro: string;
  /** Selos exibidos no topo (ex.: "LGPD — Lei nº 13.709/2018"). */
  chips?: string[];
  sections: LegalSection[];
  /** Bloco opcional renderizado após a última seção. */
  footerNote?: React.ReactNode;
}

/**
 * Casca comum das páginas institucionais: barra de topo, hero, índice fixo
 * (lateral no desktop, acordeão no mobile) e navegação entre documentos.
 * É um Server Component — nenhuma destas páginas exige autenticação.
 */
export default function LegalShell({
  slug,
  title,
  intro,
  chips = [],
  sections,
  footerNote,
}: LegalShellProps) {
  const current = LEGAL_DOCS.find((d) => d.slug === slug)!;
  const others = LEGAL_DOCS.filter((d) => d.slug !== slug);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Barra de topo */}
      <div className="no-print sticky top-0 z-30 border-b border-outline-variant/70 bg-surface-container-lowest/85 glass-effect">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/login" className="flex items-center gap-2.5 group">
            <span className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">account_balance</span>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-extrabold text-on-surface tracking-tight">GovSistem</span>
              <span className="text-[11px] text-on-surface-variant">Central de documentos</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {LEGAL_DOCS.map((doc) => (
              <Link
                key={doc.slug}
                href={doc.href}
                aria-current={doc.slug === slug ? "page" : undefined}
                className={
                  doc.slug === slug
                    ? "px-3 h-9 inline-flex items-center rounded-xl bg-primary-50 text-primary-700 text-sm font-semibold"
                    : "px-3 h-9 inline-flex items-center rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
                }
              >
                {doc.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant px-3 h-9 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span className="hidden sm:inline">Voltar ao login</span>
          </Link>
        </div>
      </div>

      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#12213c] to-primary-800 text-white">
        <div className="absolute inset-0 legal-grid opacity-[0.18]" aria-hidden />
        <div
          className="absolute -top-32 right-0 w-[520px] h-[520px] bg-primary-500/25 blur-[130px] rounded-[999px]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-[1180px] px-4 sm:px-6 py-14 sm:py-16">
          <div className="inline-flex items-center gap-2 rounded-[999px] bg-white/10 border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/80">
            <span className="material-symbols-outlined text-[16px]">{current.icon}</span>
            {current.label}
          </div>
          <h1 className="mt-5 text-3xl sm:text-[40px] leading-tight font-extrabold tracking-tight max-w-3xl">
            {title}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/70 max-w-2xl leading-relaxed">{intro}</p>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white/75">
              <span className="material-symbols-outlined text-[16px]">event</span>
              Atualizado em {LEGAL_INFO.atualizadoEm}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white/75">
              <span className="material-symbols-outlined text-[16px]">bookmark</span>
              Versão {LEGAL_INFO.versaoDocumentos}
            </span>
            {chips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white/75"
              >
                <span className="material-symbols-outlined text-[16px]">verified</span>
                {chip}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 mx-auto w-full max-w-[1180px] px-4 sm:px-6 py-10 lg:py-14">
        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
          {/* Índice */}
          <aside className="no-print mb-8 lg:mb-0">
            <div className="lg:sticky lg:top-24">
              <details className="lg:hidden rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
                <summary className="cursor-pointer text-sm font-semibold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary-600">toc</span>
                  Índice do documento
                </summary>
                <ol className="mt-3 space-y-1.5">
                  {sections.map((s, i) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="block text-sm text-on-surface-variant hover:text-primary-700"
                      >
                        {i + 1}. {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>

              <nav className="hidden lg:block" aria-label="Índice do documento">
                <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
                  Neste documento
                </p>
                <ol className="space-y-0.5 border-l border-outline-variant">
                  {sections.map((s, i) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="block -ml-px border-l-2 border-transparent pl-4 py-1.5 text-sm text-on-surface-variant hover:border-primary-500 hover:text-primary-700 transition-colors"
                      >
                        <span className="tabular-nums text-outline mr-1.5">{String(i + 1).padStart(2, "0")}</span>
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
                <div className="mt-6">
                  <PrintButton />
                </div>
              </nav>
            </div>
          </aside>

          {/* Texto */}
          <article className="legal-prose max-w-3xl">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2>
                  <span className="legal-num">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                {s.content}
              </section>
            ))}

            {footerNote}

            <div className="mt-12 rounded-2xl border border-outline-variant bg-surface-container-low p-5 text-sm text-on-surface-variant">
              <p className="font-semibold text-on-surface mb-1">Identificação do responsável</p>
              <p>
                {LEGAL_INFO.razaoSocial} — CNPJ {LEGAL_INFO.cnpj}. Contato:{" "}
                <a href={`mailto:${LEGAL_INFO.emailContato}`}>{LEGAL_INFO.emailContato}</a>.
              </p>
            </div>
          </article>
        </div>

        {/* Outros documentos */}
        <div className="no-print mt-14 pt-10 border-t border-outline-variant">
          <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">
            Continue lendo
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {others.map((doc) => (
              <Link
                key={doc.slug}
                href={doc.href}
                className="group rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 hover:border-primary-300 hover:shadow-sm transition-all"
              >
                <span className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[22px]">{doc.icon}</span>
                </span>
                <p className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                  {doc.label}
                  <span className="material-symbols-outlined text-[18px] text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    arrow_forward
                  </span>
                </p>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{doc.short}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <footer className="no-print border-t border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-on-surface-variant">
            &copy; {new Date().getFullYear()} {LEGAL_INFO.produto}. Todos os direitos reservados.
          </p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {LEGAL_DOCS.map((doc) => (
              <Link
                key={doc.slug}
                href={doc.href}
                className="text-xs text-on-surface-variant hover:text-primary-700 transition-colors"
              >
                {doc.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
