import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <FileQuestion size={32} className="text-slate-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">Página não encontrada</h1>
        <p className="text-sm text-slate-500 mb-6">
          A página que você procura não existe ou foi removida.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
