"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ContatoPage() {
  useEffect(() => {
    const icons = document.querySelectorAll<HTMLElement>(
      ".contact-icon-hover"
    );
    const onEnter = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      el.classList.add("translate-x-1");
    };
    const onLeave = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      el.classList.remove("translate-x-1");
    };
    icons.forEach((el) => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
    });
    return () => {
      icons.forEach((el) => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);

  return (
    <div className="max-w-container-max mx-auto pb-stack-lg">
      <div className="mb-stack-lg max-w-2xl">
        <span className="text-label-md font-label-md text-secondary tracking-widest uppercase mb-2 block">
          Portal Público
        </span>
        <h1 className="text-headline-lg font-headline-lg text-primary mb-4">
          Contato
        </h1>
        <p className="text-body-lg font-body-lg text-on-surface-variant leading-relaxed">
          Use os canais oficiais do município para dúvidas sobre publicações,
          autenticidade de documentos e acesso às informações.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
        <div className="md:col-span-8 bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-md flex flex-col gap-6">
          <div className="flex items-center gap-3 text-primary">
            <span className="material-symbols-outlined text-3xl">
              contact_support
            </span>
            <h2 className="text-headline-sm font-headline-sm">
              Atendimento ao Cidadão
            </h2>
          </div>
          <p className="text-body-md font-body-md text-on-surface-variant">
            Para solicitações relacionadas ao Diário Oficial, informe a edição,
            data de publicação e o assunto desejado para agilizar a análise.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-4">
            <div className="flex flex-col gap-1">
              <span className="text-label-md font-label-md text-outline uppercase tracking-wider">
                E-mail
              </span>
              <div className="contact-icon-hover flex items-center gap-2 text-primary font-semibold transition-transform duration-200">
                <span className="material-symbols-outlined text-sm">mail</span>
                <span>contato@farol.pr.gov.br</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label-md font-label-md text-outline uppercase tracking-wider">
                Telefone
              </span>
              <div className="contact-icon-hover flex items-center gap-2 text-primary font-semibold transition-transform duration-200">
                <span className="material-symbols-outlined text-sm">call</span>
                <span>(44) 3563-1101</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label-md font-label-md text-outline uppercase tracking-wider">
                Horário
              </span>
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-sm">
                  schedule
                </span>
                <span>08h 1s 12h e 13h 1s 17h</span>
              </div>
            </div>
          </div>
          <div className="border-t border-outline-variant pt-6 mt-4">
            <span className="text-label-md font-label-md text-outline uppercase tracking-wider mb-2 block">
              Localização Presencial
            </span>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-1">
                location_on
              </span>
              <div>
                <p className="text-on-surface font-semibold">
                  Prefeitura Municipal de Farol
                </p>
                <p className="text-on-surface-variant">
                  Rua Bahia, 880 - Centro, Farol - PR, 87325-000
                </p>
              </div>
            </div>
            <div className="mt-4 h-48 rounded-lg overflow-hidden relative">
              <img
                className="w-full h-full object-cover"
                alt="Mapa da Prefeitura Municipal de Farol"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBQuvjRxmZjJIvvWSkFH23kr2jtb2a6bobRtrBq19XsQPFS28L0_tDcinx2sknfj2IT--xc6mQppTj2oX9uB-kwKIzR6FDyQprG9duBQbsDOZC5hul3pQbYkpy_2q_UIonWOL-HCB20NYTfKiPgXsizL1H-JCO3bEglt_4_VvZZUOwtEwS8ChkVKia2c4FkXlYGkzWxbu7PeaREWa3NNHcQiQjjAQHSHiwxzLbywUEN3lkYU5w3t0yGf-UF_nbURE_3EpQYcX-2ytoh"
              />
            </div>
          </div>
        </div>

        <div className="md:col-span-4 flex flex-col gap-gutter">
          <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant flex flex-col gap-4">
            <div className="flex items-center gap-3 text-secondary">
              <span className="material-symbols-outlined">
                admin_panel_settings
              </span>
              <h3 className="text-headline-sm font-headline-sm">
                Portal Administrativo
              </h3>
            </div>
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Usuários autorizados podem acessar o painel administrativo pelo
              botão <strong className="text-primary">Entrar</strong> no cabeçalho
              do portal.
            </p>
            <a
              href="https://admin.govsistem.com.br/login"
              className="w-full border border-primary text-primary py-2 rounded-lg font-label-md text-label-md hover:bg-primary hover:text-on-primary transition-all flex justify-center items-center gap-2"
            >
              Acessar Painel{" "}
              <span className="material-symbols-outlined text-sm">login</span>
            </a>
          </div>

          <div className="bg-primary text-on-primary p-6 rounded-xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary-fixed">
                verified_user
              </span>
              <h3 className="text-headline-sm font-headline-sm">
                Verificar Documentos
              </h3>
            </div>
            <p className="text-body-sm font-body-sm opacity-90">
              Para validar a autenticidade de qualquer documento publicado neste
              portal, utilize nossa ferramenta de verificação de assinatura
              digital.
            </p>
            <Link
              href="/verificar"
              className="bg-secondary-container text-on-secondary-container py-3 rounded-lg font-bold text-label-md hover:scale-[0.98] transition-transform block text-center"
            >
              VERIFICAR ASSINATURA
            </Link>
          </div>

          <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-md flex flex-col gap-4">
            <h3 className="text-headline-sm font-headline-sm text-primary">
              Procura uma publicação?
            </h3>
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Economize tempo utilizando nossa busca otimizada para encontrar
              portarias, leis e decretos.
            </p>
            <Link
              href="/buscar"
              className="flex items-center justify-between bg-surface-container-highest px-4 py-3 rounded-lg text-primary font-semibold hover:bg-outline-variant transition-colors group"
            >
              <span>Buscar Publicações</span>
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
