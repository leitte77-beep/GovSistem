"use client";

import Link from "next/link";
import OrgSelector from "@/components/OrgSelector";

const CARDS = [
  {
    href: "/consulta",
    icon: "search",
    titulo: "Consultar processo",
    descricao: "Acompanhe a situação de um processo pelo número (NUP).",
  },
  {
    href: "/validar",
    icon: "verified",
    titulo: "Validar documento",
    descricao: "Confira a autenticidade de um documento emitido pelo órgão.",
  },
  {
    href: "/painel/peticionar",
    icon: "edit_document",
    titulo: "Peticionar",
    descricao: "Abra um requerimento ou junte documentos a um processo existente.",
  },
  {
    href: "/ouvidoria",
    icon: "campaign",
    titulo: "Ouvidoria",
    descricao: "Registre manifestação, reclamação, elogio ou sugestão.",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="bg-primary text-on-primary">
        <div className="max-w-container-max mx-auto px-gutter py-12 md:py-16">
          <h1 className="text-headline-lg font-headline-lg max-w-2xl">
            Processo administrativo eletrônico, do seu jeito
          </h1>
          <p className="mt-3 text-body-lg text-on-primary/80 max-w-2xl">
            Consulte processos, peticione e acompanhe seus requerimentos sem sair de casa.
          </p>
          <div className="mt-8 max-w-xl">
            <OrgSelector />
          </div>
        </div>
      </section>

      <section className="max-w-container-max mx-auto px-gutter py-12">
        <h2 className="text-headline-md font-headline-md text-on-surface mb-6">O que você precisa?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group bg-surface-container-lowest rounded-lg border border-outline-variant p-6 hover:border-primary hover:shadow-md transition-all"
            >
              <span className="material-symbols-outlined text-[32px] text-primary" aria-hidden="true">
                {c.icon}
              </span>
              <h3 className="mt-4 text-headline-sm font-headline-sm text-on-surface">{c.titulo}</h3>
              <p className="mt-2 text-body-md text-on-surface-variant">{c.descricao}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-label-md font-label-md text-primary group-hover:underline">
                Acessar
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
