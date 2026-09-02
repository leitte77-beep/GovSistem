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
    <nav aria-label="Trilha de navegação" className="text-body-sm text-on-surface-variant mb-4 no-print">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">›</span>}
              {isLast ? (
                <span aria-current="page" className="text-on-surface font-semibold">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="hover:text-primary hover:underline">
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
