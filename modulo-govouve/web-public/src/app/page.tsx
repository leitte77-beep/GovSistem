"use client";

import { useEffect, useState } from "react";
import { getSecretaria, getTiposManifestacao } from "@/lib/api";
import { MessageSquare, Star, Search, FileText, Shield } from "lucide-react";

export default function PublicHome() {
  const [secretaria, setSecretaria] = useState<any>(null);
  const [tiposManifestacao, setTiposManifestacao] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [sec, tipos] = await Promise.all([
        getSecretaria(),
        getTiposManifestacao(),
      ]);
      setSecretaria(sec);
      setTiposManifestacao(tipos);
      setLoading(false);
    }
    load();
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
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">GovOuve</h1>
          <p className="text-gray-500">Secretaria não encontrada para este endereço.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#101828]">{secretaria.nome}</h1>
              <p className="text-gray-500 text-sm mt-1">Avaliacao & Ouvidoria</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Shield className="w-4 h-4" />
              <span>Governo Municipal</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#101828] mb-4">
            Como podemos ajudar?
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Escolha uma das opcoes abaixo para avaliar nossos servicos ou registrar uma manifestacao na ouvidoria.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <a
            href="/avaliar"
            className="group bg-white rounded-xl shadow-sm border border-gray-200 p-8 hover:shadow-md hover:border-blue-300 transition-all text-center"
          >
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
              <Star className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-[#101828] mb-2">Avaliar</h3>
            <p className="text-gray-500">
              Avalie a qualidade dos servicos prestados por esta secretaria.
            </p>
          </a>

          <a
            href="/ouvidoria"
            className="group bg-white rounded-xl shadow-sm border border-gray-200 p-8 hover:shadow-md hover:border-blue-300 transition-all text-center"
          >
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
              <MessageSquare className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-[#101828] mb-2">Ouvidoria</h3>
            <p className="text-gray-500">
              Registre uma reclamacao, denuncia, sugestao, elogio ou solicitacao.
            </p>
          </a>
        </div>

        <div className="mt-12 max-w-3xl mx-auto grid md:grid-cols-2 gap-6">
          <a
            href="/acompanhar"
            className="flex items-center gap-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Search className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="font-medium text-[#101828] text-sm">Acompanhar Manifestacao</p>
              <p className="text-gray-500 text-xs">Consulte pelo protocolo e chave de acesso</p>
            </div>
          </a>

          <a
            href="/carta-servicos"
            className="flex items-center gap-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="font-medium text-[#101828] text-sm">Carta de Servicos</p>
              <p className="text-gray-500 text-xs">Conheca os servicos oferecidos</p>
            </div>
          </a>
        </div>

        {tiposManifestacao.length > 0 && (
          <div className="mt-12 max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold text-[#101828] mb-4 text-center">
              Tipos de Manifestacao e Prazos
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tiposManifestacao.map((t: any) => (
                <div
                  key={t.id}
                  className="bg-white rounded-lg border border-gray-200 p-3 text-center"
                >
                  <p className="text-sm font-medium text-[#101828]">{t.nome}</p>
                  <p className="text-xs text-gray-500">{t.prazo_dias} dias{t.prorrogavel ? ` + ${t.prorrogacao_dias}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          <p>GovOuve — Sistema de Avaliacao e Ouvidoria Municipal</p>
          {secretaria.ouvidor_responsavel && (
            <p className="mt-1">Ouvidor responsavel: {secretaria.ouvidor_responsavel}</p>
          )}
        </div>
      </footer>
    </div>
  );
}
