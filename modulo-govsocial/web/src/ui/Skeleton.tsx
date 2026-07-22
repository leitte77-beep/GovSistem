import clsx from "clsx";

type Variante = "texto" | "cartao" | "tabela" | "trilha";

export function Skeleton({
  variante = "texto",
  linhas = 3,
  className,
}: {
  variante?: Variante;
  linhas?: number;
  className?: string;
}) {
  const barra = "motion-safe:animate-pulse rounded bg-ink-soft/15";

  if (variante === "cartao") {
    return (
      <div
        className={clsx("rounded-cartao border border-ink-soft/15 bg-surface p-4", className)}
        role="status"
        aria-label="Carregando"
      >
        <div className={clsx(barra, "mb-3 h-5 w-1/3")} />
        <div className={clsx(barra, "mb-2 h-4 w-full")} />
        <div className={clsx(barra, "h-4 w-2/3")} />
        <span className="apenas-leitor">Carregando…</span>
      </div>
    );
  }

  if (variante === "tabela") {
    return (
      <div className={clsx("space-y-2", className)} role="status" aria-label="Carregando">
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className={clsx(barra, "h-10 w-full")} />
        ))}
        <span className="apenas-leitor">Carregando…</span>
      </div>
    );
  }

  if (variante === "trilha") {
    return (
      <div className={clsx("space-y-4", className)} role="status" aria-label="Carregando">
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className={clsx(barra, "h-3 w-3 rounded-full")} />
            <div className="flex-1 space-y-2">
              <div className={clsx(barra, "h-4 w-1/2")} />
              <div className={clsx(barra, "h-4 w-3/4")} />
            </div>
          </div>
        ))}
        <span className="apenas-leitor">Carregando…</span>
      </div>
    );
  }

  return (
    <div className={clsx("space-y-2", className)} role="status" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className={clsx(barra, "h-4", i === linhas - 1 ? "w-2/3" : "w-full")} />
      ))}
      <span className="apenas-leitor">Carregando…</span>
    </div>
  );
}
