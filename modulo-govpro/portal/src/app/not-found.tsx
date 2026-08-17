import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-gutter text-center">
      <span className="material-symbols-outlined text-[64px] text-outline-variant" aria-hidden="true">search_off</span>
      <h1 className="mt-4 text-headline-lg font-headline-lg text-primary">Página não encontrada</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">O recurso que você procura não existe.</p>
      <Link href="/" className="mt-6 inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors">
        Voltar ao início
      </Link>
    </div>
  );
}
