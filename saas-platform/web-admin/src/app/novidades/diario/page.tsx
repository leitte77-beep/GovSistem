"use client";

import React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";

interface Item {
  icon: string;
  title: string;
  desc: string;
}

const NOVIDADES: Item[] = [
  {
    icon: "palette",
    title: "Layouts de PDF personalizáveis",
    desc: "Escolha entre três estilos visuais para o PDF das edições publicadas: Clássico (padrão governamental), Moderno (linhas azuis e tipografia sans-serif) e Minimalista (economia de tinta).",
  },
  {
    icon: "verified_user",
    title: "Assinatura digital ICP-Brasil",
    desc: "Gerencie certificados digitais e assine as edições publicadas com validade jurídica, garantindo autenticidade e integridade dos documentos oficiais.",
  },
  {
    icon: "picture_as_pdf",
    title: "Verificação de autenticidade",
    desc: "Qualquer cidadão pode verificar se um PDF é autêntico e não foi alterado após a publicação, direto no painel ou no portal público.",
  },
  {
    icon: "upload_file",
    title: "Importação de edições legadas",
    desc: "Importe o acervo de diários antigos em PDF para o novo sistema, mantendo todo o histórico de publicações pesquisável em um só lugar.",
  },
  {
    icon: "travel_explore",
    title: "Portal público otimizado para buscas",
    desc: "Portal do cidadão com SEO aprimorado (sitemap e robots), permitindo que as edições publicadas sejam encontradas facilmente no Google.",
  },
  {
    icon: "lock",
    title: "Configurações restritas a administradores",
    desc: "A página de configurações e o gerenciamento de certificados agora são visíveis e acessíveis apenas para usuários com papel de Administrador do órgão.",
  },
  {
    icon: "key",
    title: "Redefinição de senha",
    desc: "Fluxo completo de recuperação de senha por e-mail, permitindo que usuários redefinam o acesso sem depender do administrador.",
  },
  {
    icon: "login",
    title: "Acesso integrado à plataforma",
    desc: "Entre no módulo diretamente pelo painel GovSistem com login único (SSO), sem precisar de nova senha para o Diário Oficial.",
  },
];

const CORRECOES: string[] = [
  "Correção do erro ao publicar edição — as matérias agora são validadas antes da transação.",
  "Correção do caminho dos PDFs gerados e fallback no servidor web.",
  "Health check aprimorado para monitoramento da disponibilidade do módulo.",
  "Melhorias de desempenho e refatoração da página inicial do portal público.",
];

export default function NovidadesDiarioPage() {
  return (
    <AppLayout title="Novidades — Diário Oficial">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-[#001631] mb-6"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Voltar ao painel
        </Link>

        {/* Cabeçalho */}
        <div className="bg-gradient-to-br from-[#001631] via-[#001631] to-[#5392ef] rounded-xl p-6 text-white mb-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
          <div className="relative flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
              <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-headline-lg font-bold">Diário Oficial</h2>
                <span className="px-2 py-0.5 bg-white/15 text-white text-[11px] rounded uppercase tracking-wider font-semibold">v1.0.0</span>
              </div>
              <p className="text-body-md text-white/85 mt-1">Novidades e correções desta versão.</p>
            </div>
          </div>
        </div>

        {/* Novidades */}
        <section className="mb-10">
          <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#5392ef]">auto_awesome</span>
            Novidades desta versão
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {NOVIDADES.map((n) => (
              <div key={n.title} className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 flex gap-3">
                <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg bg-[#001631]/10 text-[#001631]">
                  <span className="material-symbols-outlined">{n.icon}</span>
                </div>
                <div>
                  <h4 className="text-body-lg font-bold text-[#001631]">{n.title}</h4>
                  <p className="text-body-sm text-on-surface-variant mt-0.5 leading-relaxed">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Correções */}
        <section className="mb-10">
          <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#006d3d]">build</span>
            Correções e melhorias
          </h3>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant divide-y divide-outline-variant">
            {CORRECOES.map((c, i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                <span className="material-symbols-outlined text-[#006d3d] text-xl shrink-0">check_circle</span>
                <p className="text-body-md text-on-surface-variant">{c}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
