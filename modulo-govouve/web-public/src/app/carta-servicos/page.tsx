"use client";

import { useEffect, useState } from "react";
import { getSecretaria, getCartaServicos } from "@/lib/api";
import { FileText } from "lucide-react";

export default function CartaServicosPage() {
  const [secretaria, setSecretaria] = useState<any>(null);
  const [carta, setCarta] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSecretaria(), getCartaServicos()]).then(([sec, c]) => {
      setSecretaria(sec);
      setCarta(c);
      setLoading(false);
    });
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
          <p className="text-gray-500 text-sm">Carta de Servicos</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <FileText className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#101828] mb-2">Carta de Servicos</h2>
          {carta ? (
            <p className="text-gray-500">{carta.descricao || "Conheca os servicos oferecidos por esta secretaria."}</p>
          ) : (
            <p className="text-gray-500">
              A carta de servicos desta secretaria esta em elaboracao. Em breve voce podera consultar todos os servicos disponiveis.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
