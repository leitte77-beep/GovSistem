"use client";

/**
 * Cabeçalho de página com a faixa da marca. Dá a mesma presença da home às
 * telas internas, sem competir com o conteúdo: é curto e deixa as ações à
 * direita.
 */

export function CabecalhoPagina({
  sobretitulo,
  titulo,
  descricao,
  children,
}: {
  sobretitulo?: string;
  titulo: string;
  descricao?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-800 to-brand-900 px-6 py-5 text-white shadow-pop sm:px-7">
      <div
        className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-brass/25 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {sobretitulo && (
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ouro/80">
              {sobretitulo}
            </p>
          )}
          <h1 className="mt-1 font-display text-2xl font-medium leading-tight sm:text-3xl">
            {titulo}
          </h1>
          {descricao && (
            <div className="mt-1.5 max-w-2xl text-sm text-white/70">
              {descricao}
            </div>
          )}
        </div>
        {children && (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        )}
      </div>
    </section>
  );
}
