import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container text-outline">
          <FileQuestion size={30} aria-hidden="true" />
        </div>
        <p className="eyebrow mb-2">Erro 404</p>
        <h1 className="text-headline-lg text-primary">Página não encontrada</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          A página que você procura não existe ou foi removida.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
