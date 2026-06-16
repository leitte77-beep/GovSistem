"use client";

import { useEffect, useState } from "react";
import { getSecretaria } from "@/lib/api";
import { Star } from "lucide-react";

export default function AvaliarPage() {
  const [secretaria, setSecretaria] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSecretaria().then(setSecretaria).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!secretaria) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Secretaria nao encontrada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <a href="/" className="text-sm text-blue-600 hover:text-blue-800">&larr; Voltar</a>
          <h1 className="text-2xl font-bold text-[#101828] mt-2">{secretaria.nome}</h1>
          <p className="text-gray-500 text-sm">Avaliacao de Servicos</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <Star className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#101828] mb-2">Avaliacao de Servicos</h2>
          <p className="text-gray-500">
            O formulario de avaliacao esta em desenvolvimento. Em breve voce podera avaliar os servicos desta secretaria.
          </p>
        </div>
      </main>
    </div>
  );
}
