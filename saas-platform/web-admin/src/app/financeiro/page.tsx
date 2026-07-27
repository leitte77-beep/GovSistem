"use client";
import React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";

interface FinanceModule {
  href: string;
  icon: string;
  label: string;
  description: string;
  iconBg: string;
  iconColor: string;
}

const modules: FinanceModule[] = [
  {
    href: "/financeiro/dashboard",
    icon: "monitoring",
    label: "Dashboard Financeiro",
    description: "MRR, ARR, receita consolidada, fluxo de caixa em tempo real e relatórios DRE automatizados.",
    iconBg: "bg-[#d4e3ff]",
    iconColor: "text-[#001c3a]",
  },
  {
    href: "/faturas",
    icon: "description",
    label: "Faturas",
    description: "Gestão centralizada de faturas emitidas, controle de vencimentos e conciliação de pagamentos.",
    iconBg: "bg-[#8ff8b4]",
    iconColor: "text-[#00210f]",
  },
  {
    href: "/contas-receber",
    icon: "payments",
    label: "Contas a Receber",
    description: "Monitoramento de recebíveis, análise de aging e ferramentas automatizadas de cobrança.",
    iconBg: "bg-[#d6e3ff]",
    iconColor: "text-[#001b3d]",
  },
  {
    href: "/contas-pagar",
    icon: "outbound",
    label: "Contas a Pagar",
    description: "Controle rigoroso de despesas, fluxos de aprovação multinível e agendamento de pagamentos.",
    iconBg: "bg-[#ffdad6]",
    iconColor: "text-[#93000a]",
  },
  {
    href: "/boletos",
    icon: "barcode",
    label: "Boletos",
    description: "Emissão de guias registradas, registro bancário instantâneo e conciliação automática de lotes.",
    iconBg: "bg-[#002b54]",
    iconColor: "text-[#ffffff]",
  },
  {
    href: "/pix",
    icon: "qr_code_2",
    label: "Pix",
    description: "Geração de QR Codes dinâmicos, cobranças instantâneas e status de recebimento em tempo real.",
    iconBg: "bg-[#8cf5b1]",
    iconColor: "text-[#007240]",
  },
  {
    href: "/cartoes",
    icon: "credit_card",
    label: "Cartão de Crédito",
    description: "Links de pagamento via cartão, checkout Asaas, confirmação automática por webhook.",
    iconBg: "bg-[#f3e8ff]",
    iconColor: "text-[#4a0072]",
  },
  {
    href: "/conciliacao",
    icon: "account_balance",
    label: "Conciliação Bancária",
    description: "Importação inteligente de extratos (OFX) e conciliação automática de lançamentos financeiros.",
    iconBg: "bg-[#002a58]",
    iconColor: "text-[#ffffff]",
  },
  {
    href: "/notas-fiscais",
    icon: "receipt_long",
    label: "Notas Fiscais",
    description: "Emissão de NFS-e, cancelamentos, consulta de XML e integração com órgãos fazendários.",
    iconBg: "bg-[#264872]",
    iconColor: "text-[#ffffff]",
  },
  {
    href: "/contabilidade",
    icon: "account_tree",
    label: "Contabilidade",
    description: "Partidas dobradas, balancetes mensais, DRE contábil e balanço patrimonial detalhado.",
    iconBg: "bg-[#e0e3e5]",
    iconColor: "text-[#001631]",
  },
];

export default function FinanceiroPage() {
  return (
    <AppLayout title="GovSistem">
      <section className="mb-stack-lg">
        <h1 className="text-display-lg text-[#001631] mb-2">Módulo Financeiro</h1>
        <p className="text-body-lg text-on-surface-variant max-w-2xl">
          Gerencie todos os aspectos financeiros, contábeis e fiscais do sistema com transparência institucional e segurança máxima.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
        {modules.map((mod) => (
          <Link key={mod.href} href={mod.href} className="group">
            <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant transition-all hover:scale-[1.02] cursor-pointer" style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
              <div className={`w-14 h-14 rounded-full ${mod.iconBg} flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform`}>
                <span className={`material-symbols-outlined ${mod.iconColor} text-3xl`} style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>{mod.icon}</span>
              </div>
              <h3 className="text-headline-sm text-[#001631] mb-2">{mod.label}</h3>
              <p className="text-body-sm text-on-surface-variant leading-relaxed">{mod.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <section className="mt-stack-lg grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div className="lg:col-span-2 relative overflow-hidden rounded-xl h-[300px] flex items-center p-12" style={{ backgroundColor: "#001631" }}>
          <div className="z-10 relative">
            <span className="inline-block px-3 py-1 bg-[#8ff8b4] text-[#00210f] text-label-md rounded-full mb-4">NOVIDADE</span>
            <h2 className="text-white text-headline-lg mb-4">Relatórios Inteligentes com IA</h2>
            <p className="text-white/80 text-body-md max-w-md mb-6">
              Nossa nova ferramenta de análise preditiva ajuda você a antecipar buracos no fluxo de caixa com 90 dias de antecedência.
            </p>
            <button className="px-6 py-3 bg-white text-[#001631] font-bold rounded-xl hover:bg-[#8ff8b4] transition-colors">
              Acessar Análise
            </button>
          </div>
        </div>
        <div className="bg-[#8cf5b1] p-8 rounded-xl flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-white/40 rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-[#007240]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>verified_user</span>
            </div>
            <h3 className="text-headline-sm text-[#00210f] mb-2">Certificação Digital</h3>
            <p className="text-[#00522d] text-body-sm">Sua empresa está operando com Certificado A1 ativo e válido por mais 212 dias.</p>
          </div>
          <a href="#" className="mt-8 text-label-md text-[#00522d] flex items-center gap-2 hover:underline">
            Gerenciar Certificados
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>arrow_forward</span>
          </a>
        </div>
      </section>
    </AppLayout>
  );
}
