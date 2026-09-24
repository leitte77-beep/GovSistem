"use client";

import Link from "next/link";

export default function PrivacidadePage() {
  return (
    <div className="max-w-container-max mx-auto px-gutter py-stack-lg">
      <nav className="flex items-center gap-2 mb-stack-md text-label-md font-label-md text-on-surface-variant">
        <span className="uppercase tracking-wider">Portal Público</span>
        <span className="material-symbols-outlined text-[14px]">
          chevron_right
        </span>
        <span className="text-primary font-bold uppercase tracking-wider">
          Privacidade
        </span>
      </nav>

      <div className="max-w-4xl">
        <section className="mb-stack-lg">
          <h1 className="text-headline-lg font-headline-lg text-primary mb-stack-sm">
            Privacidade
          </h1>
          <p className="text-body-lg font-body-lg text-on-surface-variant leading-relaxed">
            Esta página resume como o portal público trata informações durante a
            consulta às publicações oficiais.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <span className="material-symbols-outlined text-[120px] text-primary">
                security
              </span>
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-primary-container">
                    dns
                  </span>
                </div>
                <h2 className="text-headline-sm font-headline-sm text-primary">
                  Dados de navegação
                </h2>
              </div>
              <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed mb-6">
                O portal pode registrar informações técnicas necessárias para
                segurança, disponibilidade do serviço e prevenção de uso
                indevido. Esses dados são coletados de forma automatizada para
                garantir a integridade da plataforma.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-surface-container-high text-label-md font-label-md px-3 py-1 rounded-full text-on-surface-variant">
                  IP do usuário
                </span>
                <span className="bg-surface-container-high text-label-md font-label-md px-3 py-1 rounded-full text-on-surface-variant">
                  Data e hora
                </span>
                <span className="bg-surface-container-high text-label-md font-label-md px-3 py-1 rounded-full text-on-surface-variant">
                  Tipo de navegador
                </span>
              </div>
            </div>
          </div>

          <div className="md:col-span-12 lg:col-span-4 bg-primary text-on-primary rounded-xl p-8 shadow-lg flex flex-col justify-between">
            <div>
              <span className="material-symbols-outlined text-4xl mb-4 text-secondary-container">
                verified_user
              </span>
              <h3 className="text-headline-sm font-headline-sm mb-4">
                Finalidade Pública
              </h3>
              <p className="text-body-sm font-body-sm opacity-90 leading-relaxed">
                Todas as informações são processadas estritamente de acordo com
                a Lei Geral de Proteção de Dados (LGPD) e o dever de
                transparência administrativa.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-white/10">
              <a
                href="#"
                className="text-label-md font-label-md uppercase tracking-widest flex items-center gap-2 hover:gap-4 transition-all text-secondary-container"
              >
                Ver conformidade LGPD
                <span className="material-symbols-outlined">arrow_forward</span>
              </a>
            </div>
          </div>

          <div className="md:col-span-12 bg-surface-container-lowest border border-outline-variant rounded-xl p-8 transition-shadow">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 rounded-xl bg-secondary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-secondary-container text-3xl">
                    menu_book
                  </span>
                </div>
              </div>
              <div>
                <h2 className="text-headline-sm font-headline-sm text-primary mb-4">
                  Publicações oficiais
                </h2>
                <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed max-w-3xl">
                  Os dados exibidos nas matérias seguem a finalidade pública dos
                  atos administrativos e devem ser consultados no contexto da
                  legislação aplicável. O acesso a editais, portarias e
                  decretos é um direito fundamental do cidadão sob o regime de
                  publicidade oficial.
                </p>
                <div className="mt-6 p-4 bg-surface-container-low rounded-lg border-l-4 border-primary">
                  <p className="text-label-md font-label-md text-on-surface-variant italic">
                    Nota: A reprodução integral ou parcial destes dados deve
                    respeitar a veracidade e a fonte original.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-stack-lg flex flex-col sm:flex-row items-center gap-6 bg-surface-container-high/30 p-8 rounded-2xl border border-dashed border-outline-variant">
          <div className="text-center sm:text-left">
            <h4 className="text-headline-sm font-headline-sm text-primary">
              Dúvidas sobre seus dados?
            </h4>
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Nossa equipe de transparência está pronta para auxiliar você.
            </p>
          </div>
          <Link
            href="/contato"
            className="sm:ml-auto bg-primary text-on-primary px-8 py-4 rounded-lg font-bold flex items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-md group"
          >
            Falar com o órgão
            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
