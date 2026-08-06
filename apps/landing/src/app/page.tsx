"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import Faq from "@/components/Faq";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.govsistem.com.br";


const chatgovFeatures = [
  { icon: "smart_toy", title: "IA Conversacional", desc: "Atendimento automático 24/7 com inteligência artificial que entende o cidadão." },
  { icon: "chat", title: "WhatsApp Nativo", desc: "O cidadão usa o WhatsApp que já conhece. Zero instalação, máxima adoção." },
  { icon: "description", title: "Protocolo Digital", desc: "Geração automática de protocolos, encaminhamento para setores e acompanhamento." },
  { icon: "analytics", title: "Dashboard Inteligente", desc: "Métricas em tempo real de atendimentos, tempo médio, satisfação e gargalos." },
];

const diarioFeatures = [
  { icon: "verified_user", title: "Assinatura ICP-Brasil", desc: "Validade jurídica com certificação digital no padrão da Infraestrutura de Chaves Públicas Brasileira." },
  { icon: "search", title: "Busca Avançada", desc: "Localize atos normativos por palavra-chave, número, data, órgão emissor ou período." },
  { icon: "history", title: "Acervo Histórico", desc: "Edições arquivadas com preservação digital permanente e acesso instantâneo." },
  { icon: "download", title: "Exportação PDF/A", desc: "Download em formato PDF/A para arquivamento com conformidade documental." },
];

const steps = [
  {
    icon: "forum",
    title: "Contato & Diagnóstico",
    desc: "Conversamos para entender a realidade do seu município e definir o escopo ideal — ChatGov, Diário Oficial ou ambos.",
  },
  {
    icon: "tune",
    title: "Configuração & Onboarding",
    desc: "Em poucos dias configuramos a plataforma, integramos os canais e treinamos sua equipe. Sem instalação de software.",
  },
  {
    icon: "trending_up",
    title: "Operação & Evolução",
    desc: "Seu município entra no ar. Acompanhamos os indicadores e entregamos melhorias contínuas, sem custo de upgrade.",
  },
];

const differentials = [
  { icon: "shield", title: "Segurança e Compliance", desc: "LGPD, ICP-Brasil, criptografia ponta-a-ponta e infraestrutura em nuvem com certificação." },
  { icon: "rocket_launch", title: "Implementação Rápida", desc: "SaaS pronto para usar. Em dias seu município está operando, sem instalação de software." },
  { icon: "support_agent", title: "Suporte Especializado", desc: "Time dedicado que entende de governo. Suporte técnico em horário comercial com SLA." },
  { icon: "devices", title: "Multi-plataforma", desc: "Acessível de qualquer dispositivo. Responsivo, com app web e integração nativa ao WhatsApp." },
  { icon: "update", title: "Atualizações Contínuas", desc: "Novas funcionalidades entregues automaticamente, sem custo adicional de upgrade." },
  { icon: "payments", title: "Economia Real", desc: "Redução de até 70% nos custos operacionais comparado a soluções tradicionais." },
];

export default function LandingPage() {
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-section");
            if (id) {
              setVisibleSections((prev) => new Set(prev).add(id));
            }
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    document.querySelectorAll("[data-section]").forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const isVisible = (id: string) => visibleSections.has(id);

  return (
    <div className="overflow-hidden">
      {/* ================================================================ */}
      {/* HERO SECTION */}
      {/* ================================================================ */}
      <section className="relative min-h-screen flex items-center justify-center bg-primary-900 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <div className="hero-glow w-[800px] h-[800px] bg-primary-500 -top-40 -right-40" />
        <div className="hero-glow w-[600px] h-[600px] bg-accent-500 bottom-0 left-0 opacity-20" />
        <div className="hero-glow w-[400px] h-[400px] bg-secondary-500 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-15" />

        <div className="relative z-10 max-w-container-max mx-auto px-gutter py-32 text-center">
          <div className="animate-fade-in-down mb-6">
            <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-2 text-sm text-white/80">
              <span className="w-2 h-2 bg-secondary-400 rounded-full animate-pulse" />
              Plataforma SaaS para o Setor Público
            </span>
          </div>

          <h1 className="text-display-lg text-white mb-6 animate-fade-in-up max-w-4xl mx-auto leading-tight">
            Tecnologia que{" "}
            <span className="text-secondary-400">transforma</span>{" "}
            a gestão pública
          </h1>

          <p className="text-body-lg text-white/70 max-w-2xl mx-auto mb-10 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            Automatize o atendimento ao cidadão e a publicação de atos oficiais com
            segurança jurídica, transparência e a simplicidade que o setor público precisa.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
            <a
              href="mailto:contato@govsistem.com.br?subject=Demonstração%20GovSistem"
              className="group inline-flex items-center gap-2 bg-white text-primary-900 px-8 py-4 rounded-full text-sm font-bold hover:bg-white/90 transition-all shadow-2xl shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-105"
            >
              <Icon name="rocket_launch" className="text-[20px]" />
              Solicitar demonstração
              <Icon name="arrow_forward" className="text-[16px] group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#solucoes"
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white px-8 py-4 rounded-full text-sm font-bold hover:bg-white/20 transition-all"
            >
              <Icon name="explore" className="text-[20px]" />
              Conhecer soluções
            </a>
          </div>

        </div>

        {/* Scroll indicator */}
        <a
          href="#solucoes"
          aria-label="Rolar para as soluções"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-float"
        >
          <Icon name="keyboard_arrow_down" className="text-white/40 text-[32px]" />
        </a>
      </section>

      {/* ================================================================ */}
      {/* SOLUTIONS OVERVIEW */}
      {/* ================================================================ */}
      <section id="solucoes" className="relative py-24 bg-surface" data-section="solucoes">
        <div className="max-w-container-max mx-auto px-gutter">
          <div className={`text-center mb-16 ${isVisible("solucoes") ? "animate-fade-in-up" : ""}`}>
            <h2 className="text-headline-lg text-primary-900 mb-4">
              Um ecossistema completo para o{" "}
              <span className="text-primary-600">setor público</span>
            </h2>
            <p className="text-body-md text-on-surface-variant max-w-xl mx-auto">
              Integramos comunicação e publicação oficial em uma única plataforma SaaS,
              segura e em conformidade com a legislação brasileira.
            </p>
          </div>

          {/* Product cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* ChatGov Card */}
            <div
              className={`group relative bg-surface rounded-2xl p-8 border border-outline-variant hover:border-primary-200 transition-all duration-500 hover:shadow-2xl hover:shadow-primary-500/5 hover:-translate-y-1 ${
                isVisible("solucoes") ? "animate-slide-in-left" : ""
              }`}
              style={{ transitionDelay: "0.15s", transitionDuration: "700ms" }}
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-secondary-400 to-secondary-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-secondary-500/25 group-hover:scale-110 transition-transform duration-500">
                  <Icon name="smart_toy" className="text-white text-[28px]" />
                </div>
                <span className="text-label-md text-secondary-600 uppercase tracking-widest bg-secondary-50 px-3 py-1 rounded-full">
                  Comunicação
                </span>
                <h3 className="text-headline-md text-primary-900 mt-3 mb-3">ChatGov</h3>
                <p className="text-body-md text-on-surface-variant mb-8">
                  Atendimento inteligente ao cidadão via WhatsApp com IA. Automatize respostas,
                  gere protocolos, encaminhe demandas e acompanhe métricas em tempo real.
                </p>
                <div className="flex flex-wrap gap-3 mb-8">
                  {["WhatsApp", "IA / NLP", "Dashboards", "Multi-atendente", "Protocolos"].map((tag) => (
                    <span key={tag} className="text-xs font-medium text-secondary-700 bg-secondary-50 px-3 py-1.5 rounded-lg">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  <a href={`${ADMIN_URL}/login`} className="flex items-center gap-2 text-sm font-semibold text-secondary-700 hover:text-secondary-800 transition-colors group/btn">
                    Acessar ChatGov
                    <Icon name="arrow_forward" className="text-[16px] group-hover/btn:translate-x-1 transition-transform" />
                  </a>
                  <a href="#chatgov" className="flex items-center gap-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
                    Ver detalhes
                    <Icon name="info" className="text-[16px]" />
                  </a>
                </div>
              </div>
            </div>

            {/* Diário Oficial Card */}
            <div
              className={`group relative bg-surface rounded-2xl p-8 border border-outline-variant hover:border-primary-200 transition-all duration-500 hover:shadow-2xl hover:shadow-primary-500/5 hover:-translate-y-1 ${
                isVisible("solucoes") ? "animate-slide-in-right" : ""
              }`}
              style={{ transitionDelay: "0.25s", transitionDuration: "700ms" }}
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-accent-400 to-accent-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-accent-500/25 group-hover:scale-110 transition-transform duration-500">
                  <Icon name="description" className="text-white text-[28px]" />
                </div>
                <span className="text-label-md text-accent-600 uppercase tracking-widest bg-accent-50 px-3 py-1 rounded-full">
                  Publicação Oficial
                </span>
                <h3 className="text-headline-md text-primary-900 mt-3 mb-3">Diário Oficial</h3>
                <p className="text-body-md text-on-surface-variant mb-8">
                  Plataforma de publicação e gestão de atos oficiais com assinatura digital
                  ICP-Brasil, busca avançada, acervo histórico e exportação em PDF/A.
                </p>
                <div className="flex flex-wrap gap-3 mb-8">
                  {["ICP-Brasil", "PDF/A", "Busca Avançada", "Acervo", "Multi-órgão"].map((tag) => (
                    <span key={tag} className="text-xs font-medium text-accent-700 bg-accent-50 px-3 py-1.5 rounded-lg">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  <a href={`${ADMIN_URL}/login`} className="flex items-center gap-2 text-sm font-semibold text-accent-700 hover:text-accent-800 transition-colors group/btn">
                    Acessar Diário
                    <Icon name="arrow_forward" className="text-[16px] group-hover/btn:translate-x-1 transition-transform" />
                  </a>
                  <a href="#diario" className="flex items-center gap-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
                    Ver detalhes
                    <Icon name="info" className="text-[16px]" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* CHATGOV DETAILED SECTION */}
      {/* ================================================================ */}
      <section id="chatgov" className="relative py-24 bg-surface-variant" data-section="chatgov">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary-50/40 to-transparent" />
        <div className="relative max-w-container-max mx-auto px-gutter">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: Visual */}
            <div className={`${isVisible("chatgov") ? "animate-slide-in-left" : ""}`}>
              <div className="relative">
                <div className="bg-surface rounded-2xl border border-outline-variant shadow-xl overflow-hidden">
                  {/* Mock WhatsApp header */}
                  <div className="bg-secondary-600 px-5 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <Icon name="smart_toy" className="text-white text-xl" />
                    </div>
                    <div>
                      <div className="text-white font-semibold text-sm">ChatGov - Prefeitura</div>
                      <div className="text-white/70 text-xs">Online • Responde em segundos</div>
                    </div>
                  </div>
                  {/* Mock chat */}
                  <div className="p-5 space-y-4 bg-[#efeae2] min-h-[340px]">
                    <div className="flex gap-2">
                      <div className="bg-white rounded-lg rounded-tl-none px-4 py-2.5 shadow-sm text-sm max-w-[80%]">
                        Olá! Sou o assistente virtual da prefeitura. Como posso ajudar?
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <div className="bg-secondary-50 rounded-lg rounded-tr-none px-4 py-2.5 shadow-sm text-sm max-w-[80%] text-right">
                        Preciso da 2ª via do IPTU
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="bg-white rounded-lg rounded-tl-none px-4 py-2.5 shadow-sm text-sm max-w-[80%]">
                        Claro! Me informe o número da inscrição imobiliária que está no carnê.
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <div className="bg-secondary-50 rounded-lg rounded-tr-none px-4 py-2.5 shadow-sm text-sm max-w-[80%] text-right">
                        123456789
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="bg-white rounded-lg rounded-tl-none px-4 py-2.5 shadow-sm text-sm max-w-[80%] whitespace-pre-line">
                        {"Pronto! Seu IPTU 2024 está disponível.\nValor: R$ 456,78\nVencimento: 15/07/2024\n\nSegue o link para download do boleto."}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating element */}
                <div className="absolute -bottom-6 -right-6 bg-surface rounded-xl border border-outline-variant shadow-lg p-4 flex items-center gap-3 animate-float-delayed">
                  <div className="w-10 h-10 bg-secondary-100 rounded-full flex items-center justify-center">
                    <Icon name="thumb_up" className="text-secondary-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-primary-900">98%</div>
                    <div className="text-xs text-on-surface-variant">Satisfação do Cidadão</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Features */}
            <div className={`${isVisible("chatgov") ? "animate-slide-in-right" : ""}`}>
              <p className="text-sm font-semibold text-secondary-600 mb-2">Para o cidadão</p>
              <h2 className="text-headline-lg text-primary-900 mb-4">
                Atendimento inteligente{" "}
                <span className="text-secondary-600">via WhatsApp</span>
              </h2>
              <p className="text-body-md text-on-surface-variant mb-8">
                Transforme o relacionamento com o cidadão. O ChatGov conecta WhatsApp
                à IA generativa para atendimento 24 horas, reduzindo filas e liberando
                servidores para demandas complexas.
              </p>
              <div className="space-y-5">
                {chatgovFeatures.map((f, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-secondary-50 rounded-lg flex items-center justify-center">
                      <Icon name={f.icon} className="text-secondary-600 text-[22px]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-primary-900 text-sm">{f.title}</h3>
                      <p className="text-sm text-on-surface-variant">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* DIÁRIO OFICIAL DETAILED SECTION */}
      {/* ================================================================ */}
      <section id="diario" className="relative py-24 bg-surface" data-section="diario">
        <div className="max-w-container-max mx-auto px-gutter">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: Features */}
            <div className={`order-2 lg:order-1 ${isVisible("diario") ? "animate-slide-in-left" : ""}`}>
              <p className="text-sm font-semibold text-accent-600 mb-2">Para o órgão público</p>
              <h2 className="text-headline-lg text-primary-900 mb-4">
                Publicação oficial com{" "}
                <span className="text-accent-600">fé jurídica</span>
              </h2>
              <p className="text-body-md text-on-surface-variant mb-8">
                Modernize a publicação dos atos do seu município. O Diário Oficial
                Eletrônico garante autenticidade jurídica com certificação ICP-Brasil,
                transparência total e acesso público irrestrito.
              </p>
              <div className="space-y-5">
                {diarioFeatures.map((f, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-accent-50 rounded-lg flex items-center justify-center">
                      <Icon name={f.icon} className="text-accent-600 text-[22px]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-primary-900 text-sm">{f.title}</h3>
                      <p className="text-sm text-on-surface-variant">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Visual */}
            <div className={`order-1 lg:order-2 ${isVisible("diario") ? "animate-slide-in-right" : ""}`}>
              <div className="relative">
                <div className="bg-surface rounded-2xl border border-outline-variant shadow-xl overflow-hidden">
                  {/* Mock browser */}
                  <div className="bg-surface-variant px-4 py-3 flex items-center gap-2 border-b border-outline-variant">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 mx-4 bg-surface rounded-lg px-3 py-1.5 text-xs text-outline">
                      govsistem.com.br/diario-oficial
                    </div>
                  </div>
                  {/* Mock content */}
                  <div className="p-6 space-y-4 min-h-[340px]">
                    <div className="border-b border-outline-variant pb-3">
                      <h3 className="text-headline-sm text-primary-900">Edição nº 1.234</h3>
                      <p className="text-sm text-on-surface-variant">15 de Julho de 2024 • Ordinária</p>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-accent-50 rounded-lg px-4 py-3 flex items-center gap-3">
                        <Icon name="verified_user" className="text-accent-600" />
                        <div>
                          <div className="text-sm font-semibold text-primary-900">Assinatura Digital ICP-Brasil</div>
                          <div className="text-xs text-on-surface-variant">Certificado válido • Autoridade Certificadora</div>
                        </div>
                      </div>
                      <div className="bg-surface-variant rounded-lg p-4 space-y-2">
                        <div className="text-xs font-semibold text-primary-900 uppercase tracking-wider">Atos do Poder Executivo</div>
                        <div className="h-1.5 bg-accent-300/30 rounded w-3/4" />
                        <div className="h-1.5 bg-accent-300/30 rounded w-full" />
                        <div className="h-1.5 bg-accent-300/30 rounded w-2/3" />
                        <div className="h-1.5 bg-accent-300/30 rounded w-4/5" />
                      </div>
                      <div className="flex gap-2">
                        <div className="bg-surface-variant rounded-lg px-4 py-2 text-xs font-medium text-accent-700 flex items-center gap-1.5">
                          <Icon name="download" className="text-[14px]" /> PDF/A
                        </div>
                        <div className="bg-surface-variant rounded-lg px-4 py-2 text-xs font-medium text-accent-700 flex items-center gap-1.5">
                          <Icon name="share" className="text-[14px]" /> Compartilhar
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating element */}
                <div className="absolute -bottom-6 -left-6 bg-surface rounded-xl border border-outline-variant shadow-lg p-4 flex items-center gap-3 animate-float">
                  <div className="w-10 h-10 bg-accent-100 rounded-full flex items-center justify-center">
                    <Icon name="security" className="text-accent-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-primary-900">ICP-Brasil</div>
                    <div className="text-xs text-on-surface-variant">Certificação Digital</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* COMO FUNCIONA */}
      {/* ================================================================ */}
      <section id="como-funciona" className="relative py-24 bg-surface-variant" data-section="como-funciona">
        <div className="max-w-container-max mx-auto px-gutter">
          <div className={`text-center mb-16 ${isVisible("como-funciona") ? "animate-fade-in-up" : ""}`}>
            <h2 className="text-headline-lg text-primary-900 mb-4">
              Do contato à operação em{" "}
              <span className="text-secondary-600">poucos dias</span>
            </h2>
            <p className="text-body-md text-on-surface-variant max-w-xl mx-auto">
              Sem licitação de software complexa, sem servidores. Um caminho simples para
              modernizar a gestão do seu município.
            </p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* connecting line (desktop) */}
            <div className="hidden md:block absolute top-8 left-[16.66%] right-[16.66%] h-0.5 bg-gradient-to-r from-primary-200 via-accent-200 to-secondary-200" />

            {steps.map((step, i) => (
              <div
                key={i}
                className={`relative text-center ${isVisible("como-funciona") ? "animate-fade-in-up" : ""}`}
                style={{ animationDelay: `${i * 0.12}s`, transitionDuration: "700ms" }}
              >
                <div className="relative z-10 mx-auto w-16 h-16 rounded-2xl bg-surface border border-outline-variant shadow-md flex items-center justify-center mb-5">
                  <Icon name={step.icon} className="text-primary-600 text-[28px]" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shadow-lg">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-headline-sm text-primary-900 mb-2">{step.title}</h3>
                <p className="text-sm text-on-surface-variant max-w-xs mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* WHY GOVSISTEM */}
      {/* ================================================================ */}
      <section className="relative py-24 bg-primary-900 overflow-hidden" data-section="diferenciais">
        <div className="absolute inset-0 grid-pattern opacity-10" />
        <div className="hero-glow w-[500px] h-[500px] bg-primary-500 top-0 right-0 opacity-20" />
        <div className="hero-glow w-[400px] h-[400px] bg-accent-500 bottom-0 left-0 opacity-15" />

        <div className="relative max-w-container-max mx-auto px-gutter">
          <div className={`text-center mb-16 ${isVisible("diferenciais") ? "animate-fade-in-up" : ""}`}>
            <p className="text-sm font-semibold text-secondary-300 mb-2">Por que escolher o GovSistem</p>
            <h2 className="text-headline-lg text-white mb-4">
              Construído para a{" "}
              <span className="text-secondary-300">realidade brasileira</span>
            </h2>
            <p className="text-body-md text-white/70 max-w-xl mx-auto">
              Entendemos os desafios da gestão pública e entregamos soluções que funcionam na prática.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {differentials.map((item, i) => (
              <div
                key={i}
                className={`group bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300 ${
                  isVisible("diferenciais") ? "animate-fade-in-up" : ""
                }`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="w-12 h-12 bg-gradient-to-br from-primary-500/20 to-accent-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Icon name={item.icon} className="text-white text-[24px]" />
                </div>
                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-white/70 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FAQ */}
      {/* ================================================================ */}
      <section id="faq" className="relative py-24 bg-surface" data-section="faq">
        <div className="max-w-container-max mx-auto px-gutter">
          <div className={`text-center mb-12 ${isVisible("faq") ? "animate-fade-in-up" : ""}`}>
            <h2 className="text-headline-lg text-primary-900 mb-4">
              Perguntas que{" "}
              <span className="text-accent-600">sempre recebemos</span>
            </h2>
            <p className="text-body-md text-on-surface-variant max-w-xl mx-auto">
              Não encontrou o que procura? Fale com a gente em{" "}
              <a href="mailto:contato@govsistem.com.br" className="text-primary-600 underline">
                contato@govsistem.com.br
              </a>.
            </p>
          </div>
          <div className={`${isVisible("faq") ? "animate-fade-in-up" : ""}`} style={{ animationDelay: "0.15s" }}>
            <Faq />
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* CTA SECTION */}
      {/* ================================================================ */}
      <section id="contato" className="relative py-24 bg-surface-variant" data-section="cta">
        <div className="max-w-container-max mx-auto px-gutter">
          <div className={`relative bg-gradient-to-br from-primary-900 via-primary-800 to-accent-900 rounded-3xl p-12 md:p-16 overflow-hidden text-center ${isVisible("cta") ? "animate-fade-in-up" : ""}`}>
            <div className="absolute inset-0 grid-pattern opacity-10" />
            <div className="hero-glow w-[300px] h-[300px] bg-primary-500 top-10 right-10 opacity-20" />
            <div className="hero-glow w-[200px] h-[200px] bg-accent-500 bottom-0 left-10 opacity-15" />

            <div className="relative z-10">
              <p className="text-sm font-semibold text-secondary-300 mb-2">Vamos conversar</p>
              <h2 className="text-display-md text-white mb-4">
                Pronto para{" "}
                <span className="text-secondary-300">modernizar</span>{" "}
                sua gestão?
              </h2>
              <p className="text-body-lg text-white/70 max-w-xl mx-auto mb-10">
                Agende uma demonstração personalizada e veja como o GovSistem
                pode transformar o atendimento e as publicações do seu município.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a
                  href="mailto:contato@govsistem.com.br?subject=Demonstração%20GovSistem"
                  className="group inline-flex items-center gap-2 bg-white text-primary-900 px-8 py-4 rounded-full text-sm font-bold hover:bg-white/90 transition-all shadow-2xl shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-105"
                >
                  <Icon name="mail" className="text-[20px]" />
                  Agendar demonstração
                  <Icon name="arrow_forward" className="text-[16px] group-hover:translate-x-1 transition-transform" />
                </a>
                <a
                  href={`${ADMIN_URL}/login`}
                  className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 text-white px-8 py-4 rounded-full text-sm font-bold hover:bg-white/20 transition-all"
                >
                  <Icon name="login" className="text-[20px]" />
                  Entrar na plataforma
                </a>
              </div>
              <p className="text-sm text-white/50 mt-8">
                Responderemos em até 1 dia útil.{" "}
                <a href="mailto:contato@govsistem.com.br" className="text-white/60 hover:text-white underline transition-colors">
                  contato@govsistem.com.br
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
