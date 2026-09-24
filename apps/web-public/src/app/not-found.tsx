import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="text-center max-w-md">
        <span className="material-symbols-outlined text-outline text-6xl mb-4">search_off</span>
        <h1 className="text-headline-lg font-bold text-on-surface mb-2">Página não encontrada</h1>
        <p className="text-body-md text-on-surface-variant mb-6">
          A página que você procura não existe ou foi removida.
        </p>
        <Link
          href="/"
          className="bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md hover:opacity-90 transition-opacity inline-block"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
