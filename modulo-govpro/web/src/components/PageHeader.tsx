export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-gutter py-stack-md max-w-container-max mx-auto w-full">
      <div>
        <h1 className="text-headline-lg font-headline-lg text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-body-md text-on-surface-variant">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
