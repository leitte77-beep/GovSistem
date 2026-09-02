import Link from "next/link";

export type EditionBreadcrumbProps = {
  year: number;
  number: number;
};

export default function EditionBreadcrumb({ year, number }: EditionBreadcrumbProps) {
  const items = [
    { label: "Início", href: "/" },
    { label: "Diário Oficial", href: "/edicoes" },
    { label: String(year), href: `/edicoes?year=${year}` },
    { label: `Edição nº ${number}`, href: `/edicoes/${year}/${number}` },
  ];

  return (
    <nav aria-label="Trilha de navegação" className="mb-7 text-[13px] text-edition-muted no-print">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">›</span>}
              {isLast ? (
                <span aria-current="page" className="font-semibold text-edition-ink">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-[var(--edition-accent)] hover:underline"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
