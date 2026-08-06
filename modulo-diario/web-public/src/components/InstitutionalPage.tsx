import Link from "next/link";

type Section = {
  title: string;
  body: string;
};

type InstitutionalPageProps = {
  title: string;
  description: string;
  sections: Section[];
  actionHref?: string;
  actionLabel?: string;
};

export default function InstitutionalPage({
  title,
  description,
  sections,
  actionHref = "/",
  actionLabel = "Voltar ao início",
}: InstitutionalPageProps) {
  return (
    <section className="bg-surface py-stack-lg">
      <div className="max-w-4xl mx-auto px-gutter">
        <div className="mb-stack-lg">
          <p className="text-label-md font-label-md text-secondary uppercase tracking-widest mb-3">
            Portal público
          </p>
          <h1 className="font-headline-lg text-headline-lg text-primary mb-stack-sm">
            {title}
          </h1>
          <p className="text-body-lg font-body-lg text-on-surface-variant">
            {description}
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm divide-y divide-outline-variant">
          {sections.map((section) => (
            <article key={section.title} className="p-6">
              <h2 className="font-headline-sm text-headline-sm text-primary mb-2">
                {section.title}
              </h2>
              <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed">
                {section.body}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-stack-md">
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity"
          >
            {actionLabel}
            <span className="material-symbols-outlined text-[18px]">
              arrow_forward
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
