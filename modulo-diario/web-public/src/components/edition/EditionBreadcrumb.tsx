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
    <nav aria-label="Trilha de navegação" className="text-[13px] text-slate-500 no-print">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-slate-300">
                  chevron_right
                </span>
              )}
              {isLast ? (
                <span aria-current="page" className="font-semibold text-[#0b192c]">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="rounded-md px-1.5 py-0.5 font-medium transition-colors hover:text-brand-accent hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
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
