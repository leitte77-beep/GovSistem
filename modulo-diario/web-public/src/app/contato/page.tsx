"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useOrg } from "@/lib/org-context";
import type { OrganizationContact } from "@/lib/api";
import { formatTitleCase } from "@/lib/summary";

function formatPhone(raw?: string | null): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return raw || "";
}

function formatCep(raw?: string | null): string {
  const d = (raw || "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : raw || "";
}

/** "Rua Bahia, 880 - Centro" / "Farol - PR, CEP 87325-000" a partir do cadastro. */
function addressLines(c?: OrganizationContact | null): [string, string] | null {
  if (!c?.address_street) return null;
  const tc = (v?: string | null) => (v ? formatTitleCase(v) : "");
  const line1 = [
    [tc(c.address_street), c.address_number].filter(Boolean).join(", "),
    tc(c.address_complement),
    tc(c.address_district),
  ].filter(Boolean).join(" - ");
  const city = [tc(c.address_city), c.state?.toUpperCase()].filter(Boolean).join(" - ");
  const cep = formatCep(c.address_postal_code);
  return [line1, [city, cep && `CEP ${cep}`].filter(Boolean).join(", ")];
}

export default function ContatoPage() {
  const { org } = useOrg();
  const contact = org?.contact;
  const email = contact?.email;
  const phone = formatPhone(contact?.phone);
  const address = addressLines(contact);
  const mapQuery = address ? `${address[0]}, ${address[1]}, Brasil` : null;
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
          <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:gap-x-10">
            <div className="flex flex-col gap-1">
              <span className="text-label-md font-label-md text-outline uppercase tracking-wider">
                E-mail
              </span>
              <div className="contact-icon-hover flex items-center gap-2 text-primary font-semibold transition-transform duration-200">
                <span className="material-symbols-outlined text-sm">mail</span>
                {email ? <a href={`mailto:${email}`} className="[overflow-wrap:anywhere] hover:underline">{email}</a> : <span className="text-on-surface-variant">Não informado</span>}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-label-md font-label-md text-outline uppercase tracking-wider">
                Telefone
              </span>
              <div className="contact-icon-hover flex items-center gap-2 text-primary font-semibold transition-transform duration-200">
                <span className="material-symbols-outlined text-sm">call</span>
                {phone ? <a href={`tel:+55${(contact?.phone || "").replace(/\D/g, "")}`} className="hover:underline">{phone}</a> : <span className="text-on-surface-variant">Não informado</span>}
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
                <span>08h às 12h e 13h às 17h</span>
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
                  {org?.name ? formatTitleCase(org.name) : "Prefeitura Municipal"}
                </p>
                {address ? (
                  <>
                    <p className="text-on-surface-variant">{address[0]}</p>
                    <p className="text-on-surface-variant">{address[1]}</p>
                  </>
                ) : (
                  <p className="text-on-surface-variant">Endereço não informado</p>
                )}
              </div>
            </div>
            {mapQuery && (
              <>
                <div className="mt-4 h-64 overflow-hidden rounded-lg border border-outline-variant">
                  <iframe
                    title={`Mapa: ${address![0]}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
                    className="h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  Abrir no Google Maps
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px]">open_in_new</span>
                </a>
              </>
            )}
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
