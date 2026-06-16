"use client";

import { useEffect, useState } from "react";
import { getSecretaria } from "@/lib/api";
import { Search } from "lucide-react";

export default function AcompanharPage() {
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
          <p className="text-gray-500 text-sm">Acompanhar Manifestacao</p>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <Search className="w-12 h-12 text-blue-600 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-[#101828]">Consultar Protocolo</h2>
            <p className="text-gray-500 text-sm mt-1">
              Informe o numero do protocolo e a chave de acesso para acompanhar sua manifestacao.
            </p>
          </div>
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Protocolo</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: 2024/000123"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chave de Acesso</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Chave fornecida no protocolo"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Consultar
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
