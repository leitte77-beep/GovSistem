"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function MapaDoSitePage() {
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>(".sitemap-card");
    const onEnter = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      el.style.transform = "translateY(-4px)";
      el.style.transition = "all 0.3s ease";
    };
    const onLeave = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      el.style.transform = "translateY(0)";
    };
    cards.forEach((card) => {
      card.addEventListener("mouseenter", onEnter);
      card.addEventListener("mouseleave", onLeave);
    });
    return () => {
      cards.forEach((card) => {
        card.removeEventListener("mouseenter", onEnter);
        card.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);

  return (
    <div className="max-w-container-max mx-auto px-gutter py-stack-lg">
      <section className="mb-stack-lg border-b border-outline-variant pb-8">
        <h1 className="font-headline-lg text-headline-lg text-primary mb-2">
          Mapa do Site
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          Navegue por toda a estrutura do Portal da Imprensa Nacional de forma
          hierárquica e organizada.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
        <div className="sitemap-card bg-surface-container-lowest p-8 rounded-xl flex flex-col gap-stack-md border border-outline-variant shadow-sm">
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined text-[28px]">home</span>
            <h2 className="font-headline-sm text-headline-sm">Geral</h2>
          </div>
          <ul className="space-y-3">
            <li>
              <Link
                href="/"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Início
              </Link>
            </li>
            <li>
              <Link
                href="/edicoes"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Edições
              </Link>
            </li>
          </ul>
        </div>

        <div className="sitemap-card bg-surface-container-lowest p-8 rounded-xl flex flex-col gap-stack-md border border-outline-variant shadow-sm">
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined text-[28px]">
              search_insights
            </span>
            <h2 className="font-headline-sm text-headline-sm">Pesquisa</h2>
          </div>
          <ul className="space-y-3">
            <li>
              <Link
                href="/buscar"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Pesquisa Avançada
              </Link>
            </li>
            <li>
              <Link
                href="/acervo"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Acervo Histórico
              </Link>
            </li>
          </ul>
        </div>

        <div className="sitemap-card bg-primary-container p-8 rounded-xl flex flex-col gap-stack-md">
          <div className="flex items-center gap-3 text-primary-fixed-dim">
            <span className="material-symbols-outlined text-[28px]">
              verified_user
            </span>
            <h2 className="font-headline-sm text-headline-sm text-white">
              Serviços
            </h2>
          </div>
          <ul className="space-y-3">
            <li>
              <Link
                href="/verificar"
                className="font-body-md text-body-md text-white/80 hover:text-white flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-on-primary-container group-hover:bg-primary-fixed-dim" />
                Verificar Assinatura Digital
              </Link>
            </li>
            <li>
              <Link
                href="/contato"
                className="font-body-md text-body-md text-white/80 hover:text-white flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-on-primary-container group-hover:bg-primary-fixed-dim" />
                Certificados de Publicação
              </Link>
            </li>
          </ul>
        </div>

        <div className="sitemap-card bg-surface-container-lowest p-8 rounded-xl flex flex-col gap-stack-md border border-outline-variant shadow-sm">
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined text-[28px]">
              account_balance
            </span>
            <h2 className="font-headline-sm text-headline-sm">
              Institucional
            </h2>
          </div>
          <ul className="space-y-3">
            <li>
              <Link
                href="/sobre"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Sobre o Portal
              </Link>
            </li>
            <li>
              <Link
                href="/privacidade"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Transparência e Governança
              </Link>
            </li>
          </ul>
        </div>

        <div className="sitemap-card bg-surface-container-lowest p-8 rounded-xl flex flex-col gap-stack-md border border-outline-variant shadow-sm">
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined text-[28px]">
              contact_support
            </span>
            <h2 className="font-headline-sm text-headline-sm">Ajuda</h2>
          </div>
          <ul className="space-y-3">
            <li>
              <Link
                href="/contato"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Fale Conosco
              </Link>
            </li>
            <li>
              <Link
                href="/contato"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Suporte Técnico
              </Link>
            </li>
          </ul>
        </div>

        <div className="sitemap-card bg-surface-container-lowest p-8 rounded-xl flex flex-col gap-stack-md border border-outline-variant shadow-sm">
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined text-[28px]">
              gavel
            </span>
            <h2 className="font-headline-sm text-headline-sm">Políticas</h2>
          </div>
          <ul className="space-y-3">
            <li>
              <Link
                href="/privacidade"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Privacidade e Termos de Uso
              </Link>
            </li>
            <li>
              <Link
                href="/acessibilidade"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Acessibilidade Digital
              </Link>
            </li>
            <li>
              <Link
                href="/mapa-do-site"
                className="font-body-md text-body-md text-on-surface hover:text-primary flex items-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant group-hover:bg-primary" />
                Mapa do Site
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <section className="mt-stack-lg bg-secondary-container rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 border border-outline-variant">
        <div className="space-y-2">
          <h3 className="font-headline-sm text-headline-sm text-on-secondary-container">
            Não encontrou o que procurava?
          </h3>
          <p className="font-body-md text-body-md text-on-secondary-fixed-variant">
            Utilize nossa pesquisa avançada para filtrar documentos por data,
            órgão ou termos específicos.
          </p>
        </div>
        <Link
          href="/buscar"
          className="bg-primary text-white px-6 py-3 rounded-lg font-label-md text-label-md hover:opacity-90 transition-all flex items-center gap-2 flex-shrink-0"
        >
          <span className="material-symbols-outlined">search</span>
          Ir para Pesquisa Avançada
        </Link>
      </section>
    </div>
  );
}
