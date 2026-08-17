export default function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-gutter">
      <span className="material-symbols-outlined text-[48px] text-outline-variant" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mt-4 text-headline-sm font-headline-sm text-on-surface">{title}</h3>
      {description && <p className="mt-2 text-body-md text-on-surface-variant max-w-md">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
