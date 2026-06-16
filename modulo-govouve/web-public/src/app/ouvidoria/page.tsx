"use client";

import { useEffect, useState } from "react";
import { getSecretaria, getTiposManifestacao } from "@/lib/api";
import { MessageSquare } from "lucide-react";

export default function OuvidoriaPage() {
  const [secretaria, setSecretaria] = useState<any>(null);
  const [tipos, setTipos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSecretaria(), getTiposManifestacao()]).then(([sec, t]) => {
      setSecretaria(sec);
      setTipos(t);
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
          <p className="text-gray-500 text-sm">Ouvidoria — Registre sua manifestacao</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <MessageSquare className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#101828] mb-2">Registrar Manifestacao</h2>
          <p className="text-gray-500">
            O formulario de manifestacao esta em desenvolvimento. Em breve voce podera registrar reclamacoes, denuncias, sugestoes, elogios e solicitacoes.
          </p>
        </div>

        {tipos.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-[#101828] mb-4 text-center">
              Tipos de Manifestacao
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tipos.map((t: any) => (
                <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                  <p className="text-sm font-medium text-[#101828]">{t.nome}</p>
                  <p className="text-xs text-gray-500">
                    {t.prazo_dias} dias{t.prorrogavel ? ` + ${t.prorrogacao_dias}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
