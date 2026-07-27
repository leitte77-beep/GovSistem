"use client";
import React from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import { Settings } from "lucide-react";

export default function ConfiguracoesPage() {
  return (
    <AppLayout title="Configuracoes">
      <Card className="max-w-2xl">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 rounded-full bg-gray-100 mb-4">
            <Settings size={40} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Configuracoes da Plataforma</h3>
          <p className="text-gray-500 max-w-md">
            As configuracoes da plataforma estarao disponiveis em breve. Aqui voce podera gerenciar parametros globais, integracoes e preferencias do sistema.
          </p>
        </div>
      </Card>
    </AppLayout>
  );
}
