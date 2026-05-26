"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SobrePage() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("a, button");
    const onMouseDown = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      el.style.transform = "scale(0.98)";
    };
    const onMouseUp = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      el.style.transform = "scale(1)";
    };
    const onMouseLeave = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      el.style.transform = "scale(1)";
    };
    els.forEach((el) => {
      el.addEventListener("mousedown", onMouseDown);
      el.addEventListener("mouseup", onMouseUp);
      el.addEventListener("mouseleave", onMouseLeave);
    });
    return () => {
      els.forEach((el) => {
        el.removeEventListener("mousedown", onMouseDown);
        el.removeEventListener("mouseup", onMouseUp);
        el.removeEventListener("mouseleave", onMouseLeave);
      });
    };
  }, []);

  return (
    <>
      <section className="bg-surface py-12 border-b border-outline-variant">
        <div className="max-w-container-max mx-auto px-gutter flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <h1 className="font-headline-lg text-headline-lg md:text-display-lg text-primary mb-6">
              Sobre o Portal
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
              Bem-vindo ao novo Portal do Diário Oficial Eletrônico de Farol.
              Uma plataforma moderna desenvolvida para garantir transparência,
              acessibilidade e agilidade na divulgação dos atos oficiais do
              nosso município.
            </p>
          </div>
          <div className="flex-shrink-0">
            <img
              alt="Brasão de Farol"
              className="h-48 w-auto drop-shadow-lg"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuA0Kcjp4McoeNBLyh6h2jUM4wajiprutuZzieuAJ6BkQz9ArrtQucTEpXOeMP8TzEBmF6MEsNPzHbF_sMf5o8kYz9EYxeZPYM3Sb-QqjLMtgpQ6hHKk2z-dArpbEe3DPZfn9zo1O3dn8O5vagDmqRlSGsHQEv21hQ5RJDkdzgAs9VuFApkUklT3gr5GdYFlROLNR4dKp9RitFWc_yj8vxA4s-J8_TZVR6HzKS6LkBCeSGXMDzMG0goqOtRGN3VggB9STY5Wj00iTeg6"
            />
          </div>
        </div>
      </section>

      <div className="max-w-container-max mx-auto px-gutter py-stack-lg">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-stack-lg">
          <div className="md:col-span-12 bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-primary-container p-3 rounded-lg text-on-primary-container">
                <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
                  gavel
                </span>
              </div>
              <h2 className="font-headline-md text-headline-md text-primary">
                Finalidade do Portal
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div>
                <p className="font-body-md text-body-md text-on-surface-variant mb-6 leading-relaxed">
                  O Diário Oficial Eletrônico é o veículo oficial de
                  comunicação, publicidade e fomento da transparência dos atos
                  administrativos da Prefeitura Municipal de Farol. Sua
                  finalidade principal é centralizar e disponibilizar, de forma
                  digital e totalmente gratuita, todos os atos normativos,
                  editais de licitação, decretos e documentos públicos.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-fit">
                <div className="flex items-start gap-3 p-3 bg-surface rounded-lg">
                  <span className="material-symbols-outlined text-secondary">
                    check_circle
                  </span>
                  <span className="font-label-md text-label-md text-on-surface">
                    Acesso universal e gratuito
                  </span>
                </div>
                <div className="flex items-start gap-3 p-3 bg-surface rounded-lg">
                  <span className="material-symbols-outlined text-secondary">
                    check_circle
                  </span>
                  <span className="font-label-md text-label-md text-on-surface">
                    Redução de custos operacionais
                  </span>
                </div>
                <div className="flex items-start gap-3 p-3 bg-surface rounded-lg">
                  <span className="material-symbols-outlined text-secondary">
                    check_circle
                  </span>
                  <span className="font-label-md text-label-md text-on-surface">
                    Sustentabilidade ambiental
                  </span>
                </div>
                <div className="flex items-start gap-3 p-3 bg-surface rounded-lg">
                  <span className="material-symbols-outlined text-secondary">
                    check_circle
                  </span>
                  <span className="font-label-md text-label-md text-on-surface">
                    Preservação histórica digital
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="mb-stack-lg">
          <div className="text-center mb-10">
            <h2 className="font-headline-lg text-headline-lg text-primary mb-2">
              Transparência e Segurança
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mx-auto">
              Tecnologias de ponta que garantem validade jurídica e integridade
              total.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant text-center hover:border-primary transition-colors">
              <span className="material-symbols-outlined text-primary text-5xl mb-4">
                verified_user
              </span>
              <h3 className="font-headline-sm text-headline-sm text-primary mb-3">
                ICP-Brasil
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Documentos assinados digitalmente seguindo os padrões brasileiros
                de segurança.
              </p>
            </div>
            <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant text-center hover:border-primary transition-colors">
              <span className="material-symbols-outlined text-primary text-5xl mb-4">
                search_check
              </span>
              <h3 className="font-headline-sm text-headline-sm text-primary mb-3">
                Consulta Pública
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Verificação instantânea de autenticidade via código verificador
                ou QR Code.
              </p>
            </div>
            <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant text-center hover:border-primary transition-colors">
              <span className="material-symbols-outlined text-primary text-5xl mb-4">
                history
              </span>
              <h3 className="font-headline-sm text-headline-sm text-primary mb-3">
                Imutabilidade
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Registros permanentes e inalteráveis, preservando a memória
                administrativa.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center bg-surface-container-lowest p-8 md:p-12 rounded-xl border border-outline-variant">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-primary mb-8">
              Como Funciona
            </h2>
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-on-primary rounded-lg flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-headline-sm text-headline-sm text-primary mb-1">
                    Periodicidade
                  </h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    As edições são publicadas diariamente nos dias úteis,
                    garantindo agilidade na informação.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-on-primary rounded-lg flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h4 className="font-headline-sm text-headline-sm text-primary mb-1">
                    Busca Inteligente
                  </h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Filtros avançados por data, órgão ou palavras-chave para
                    localização precisa de documentos.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary text-on-primary rounded-lg flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h4 className="font-headline-sm text-headline-sm text-primary mb-1">
                    Visualização e Download
                  </h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Acesso instantâneo em PDF assinado digitalmente, pronto para
                    visualização ou impressão.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-10">
              <Link
                href="/edicoes"
                className="inline-flex items-center gap-2 bg-primary text-on-primary px-8 py-3 rounded-lg font-bold hover:bg-primary-container transition-all"
              >
                Acessar o Acervo
                <span className="material-symbols-outlined">arrow_forward</span>
              </Link>
            </div>
          </div>
          <div className="relative rounded-xl overflow-hidden shadow-xl aspect-video">
            <img
              alt="Acesso Digital"
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCXLpQ5iiG4ly38t_iOL98Qg0SA4nMDNIXtopRSeSw8shkzsoOBdb-GIPC35uQuRaiUoLNieGKpC8YJzVItagIcFovlmu6UFKRWIWlQCRq0WeQ1WTHnwosN9I8DUrLYUPxGgKMCsukSqFn9XiiECEn8NkXzQA0mokGuwKyS24gAIKduBzCR8MAfpUotIctF123e9jjM7bMyo6MDXn_YsW1R3UPVpyD0810eGfA5bVn4IJNgszvSSowpHy5Pf9-HG8d6VkZQOgexJSHo"
            />
            <div className="absolute inset-0 bg-primary/10" />
          </div>
        </section>
      </div>
    </>
  );
}
