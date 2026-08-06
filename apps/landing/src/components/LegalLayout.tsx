import Link from "next/link";
import Icon from "@/components/Icon";

type LegalLayoutProps = {
  title: string;
  intro: string;
  updatedAt: string;
  children: React.ReactNode;
};

/**
 * Shared shell for legal/institutional pages. The dark hero band sits beneath
 * the fixed (initially transparent) navbar so its light text stays legible.
 */
export default function LegalLayout({ title, intro, updatedAt, children }: LegalLayoutProps) {
  return (
    <div>
      <header className="relative bg-primary-900 overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <div className="hero-glow w-[500px] h-[500px] bg-primary-500 -top-40 right-0 opacity-25" />
        <div className="relative z-10 max-w-container-max mx-auto px-gutter pt-32 pb-16">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors mb-6"
          >
            <Icon name="arrow_back" className="text-[18px]" />
            Voltar ao início
          </Link>
          <h1 className="text-headline-lg text-white mb-4 max-w-3xl">{title}</h1>
          <p className="text-body-lg text-white/60 max-w-2xl">{intro}</p>
          <p className="text-label-md text-white/40 uppercase tracking-widest mt-6">
            Última atualização: {updatedAt}
          </p>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-gutter py-stack-lg prose-legal">
        {children}
      </article>
    </div>
  );
}
