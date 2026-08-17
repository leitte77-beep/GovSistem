"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-gutter text-center">
      <span className="material-symbols-outlined text-[64px] text-error" aria-hidden="true">error</span>
      <h1 className="mt-4 text-headline-lg font-headline-lg text-primary">Algo deu errado</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">Ocorreu um erro inesperado. Tente novamente.</p>
      <button onClick={reset} className="mt-6 inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors">
        Tentar novamente
      </button>
    </div>
  );
}
