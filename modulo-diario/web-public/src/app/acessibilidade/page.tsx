"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";

export default function AcessibilidadePage() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("button, a");
    const onDown = (e: MouseEvent) => {
      (e.currentTarget as HTMLElement).classList.add("scale-95");
    };
    const onUp = (e: MouseEvent) => {
      (e.currentTarget as HTMLElement).classList.remove("scale-95");
    };
    const onLeave = (e: MouseEvent) => {
      (e.currentTarget as HTMLElement).classList.remove("scale-95");
    };
    els.forEach((el) => {
      el.addEventListener("mousedown", onDown);
      el.addEventListener("mouseup", onUp);
      el.addEventListener("mouseleave", onLeave);
    });
    return () => {
      els.forEach((el) => {
        el.removeEventListener("mousedown", onDown);
        el.removeEventListener("mouseup", onUp);
        el.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);

  return (
    <>
      <section className="bg-surface-container-lowest border-b border-outline-variant py-12">
        <div className="max-w-container-max mx-auto px-gutter">
          <nav className="mb-6 flex items-center gap-2 text-label-md text-on-surface-variant">
            <span>Portal Público</span>
            <span className="material-symbols-outlined text-[14px]">
              chevron_right
            </span>
            <span className="text-primary font-bold">Acessibilidade</span>
          </nav>
          <div className="max-w-3xl">
            <span className="text-secondary font-bold text-label-md tracking-widest uppercase mb-2 block">
              Cidadania &amp; Inclusão
            </span>
            <h2 className="text-headline-lg font-headline-lg text-primary mb-6">
              Acessibilidade
            </h2>
            <p className="text-body-lg font-body-lg text-on-surface-variant leading-relaxed">
              O portal busca oferecer uma experiência de consulta clara,
              responsiva e compatível com tecnologias assistivas, garantindo que
              o acesso à informação pública seja um direito exercido por todos.
            </p>
          </div>
        </div>
      </section>

      <section className="py-stack-lg max-w-container-max mx-auto px-gutter">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-8 shadow-md flex flex-col">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-lg bg-primary-fixed flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary-fixed text-[32px]">
                  keyboard
                </span>
              </div>
              <h3 className="text-headline-md font-headline-md text-primary">
                Navegação
              </h3>
            </div>
            <div className="grid md:grid-cols-2 gap-8 flex-grow">
              <div>
                <h4 className="font-bold text-primary mb-2">
                  Estrutura Semântica
                </h4>
                <p className="text-body-md text-on-surface-variant">
                  Utilizamos HTML5 semântico para garantir que leitores de tela
                  identifiquem corretamente cabeçalhos, listas e seções de
                  conteúdo.
                </p>
              </div>
              <div>
                <h4 className="font-bold text-primary mb-2">
                  Compatibilidade
                </h4>
                <p className="text-body-md text-on-surface-variant">
                  Interface testada com os principais navegadores e softwares de
                  leitura de tela (NVDA, JAWS e TalkBack).
                </p>
              </div>
              <div>
                <h4 className="font-bold text-primary mb-2">
                  Teclado Amigável
                </h4>
                <p className="text-body-md text-on-surface-variant">
                  Toda a interface pode ser operada via teclado, com
                  indicadores de foco visíveis e lógicos.
                </p>
              </div>
              <div>
                <h4 className="font-bold text-primary mb-2">Legibilidade</h4>
                <p className="text-body-md text-on-surface-variant">
                  Contrastes calculados para atender aos padrões WCAG 2.1 AA e
                  fontes otimizadas para leitura prolongada.
                </p>
              </div>
            </div>
          </div>

          <div className="md:col-span-4 bg-primary text-on-primary rounded-xl p-8 flex flex-col justify-between shadow-lg">
            <div>
              <h3 className="text-headline-sm font-headline-sm mb-4">
                Melhoria contínua
              </h3>
              <p className="text-on-primary-container leading-relaxed mb-8">
                Nossa equipe trabalha diariamente para remover barreiras.
                Encontrou algum obstáculo ou tem uma sugestão de melhoria?
              </p>
            </div>
            <Link
              href="/contato"
              className="w-full py-4 bg-secondary-fixed text-on-secondary-fixed font-bold rounded-lg flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all"
            >
              <span>Reportar dificuldade</span>
              <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
          </div>

          <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm flex gap-4 items-start">
              <span className="material-symbols-outlined text-primary text-[28px]">
                text_increase
              </span>
              <div>
                <h4 className="font-bold text-primary mb-1">Ajuste de Fonte</h4>
                <p className="text-body-sm text-on-surface-variant">
                  Use os atalhos do navegador (Ctrl+ / Ctrl-) para
                  redimensionar o texto conforme sua necessidade.
                </p>
              </div>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm flex gap-4 items-start">
              <span className="material-symbols-outlined text-primary text-[28px]">
                contrast
              </span>
              <div>
                <h4 className="font-bold text-primary mb-1">Alto Contraste</h4>
                <p className="text-body-sm text-on-surface-variant">
                  O portal foi desenhado com paleta de alto contraste nativa,
                  eliminando a necessidade de filtros externos.
                </p>
              </div>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm flex gap-4 items-start">
              <span className="material-symbols-outlined text-primary text-[28px]">
                description
              </span>
              <div>
                <h4 className="font-bold text-primary mb-1">Leis de Acesso</h4>
                <p className="text-body-sm text-on-surface-variant">
                  Conformidade total com a Lei Brasileira de Inclusão (Lei nº
                  13.146/2015) no ambiente digital.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-container-max mx-auto px-gutter mb-stack-lg">
        <div className="relative h-[400px] rounded-2xl overflow-hidden shadow-2xl">
          <Image
            fill
            sizes="100vw"
            className="object-cover grayscale brightness-50"
            alt="Espaço de trabalho tecnológico e acessível"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBBYwze62zIPj1s6zupRaXZjWpAK0oiDveSp0JuiXbDHeQsRq4wnv74TQqqSNb158EihT0y69uFdWxylNs_vvLy6QCbsB4Vqck_XLVMMG1L1v8IMknNe8luvqyFk6R0JwDRgYLfL8sD9RNtCPLiKvR0CkquAFFUPj8BnQdTAlEbIRQFdc0rTRhTbbhY3H4uDO3jdOf29LysbroEE4WUKkKimUsTNfleRAnB-PFWshVutxNeI1uvR4loiJZ08L6asnicCTwTuD2cCnTN"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex items-end p-12">
            <div className="max-w-2xl">
              <h2 className="text-headline-lg font-headline-lg text-white mb-4">
                Tecnologia a serviço da transparência
              </h2>
              <p className="text-body-lg text-on-primary-container">
                Cada linha de código deste portal é escrita pensando em quem
                mais precisa de clareza e objetividade no acesso aos atos
                oficiais do município.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
