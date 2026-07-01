"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

const FAQS = [
  {
    q: "O GovSistem é adequado para municípios de pequeno porte?",
    a: "Sim. Por ser uma plataforma SaaS, não há servidores para instalar nem equipe de TI dedicada. Pequenos e médios municípios começam a operar em poucos dias, pagando apenas pelo que usam.",
  },
  {
    q: "As assinaturas do Diário Oficial têm validade jurídica?",
    a: "Sim. Utilizamos certificação digital no padrão ICP-Brasil, garantindo autenticidade, integridade e validade jurídica plena dos atos publicados, em conformidade com a legislação brasileira.",
  },
  {
    q: "É preciso instalar algum aplicativo para o cidadão usar o ChatGov?",
    a: "Não. O atendimento acontece no WhatsApp que o cidadão já tem no celular. Zero instalação, zero curva de aprendizado — o que se traduz em altíssima taxa de adoção.",
  },
  {
    q: "Como funciona a proteção de dados e a conformidade com a LGPD?",
    a: "Tratamos dados pessoais segundo a Lei Geral de Proteção de Dados (LGPD), com criptografia em trânsito e em repouso, controle de acesso por perfil e registro de auditoria das operações.",
  },
  {
    q: "Posso contratar apenas um dos módulos?",
    a: "Sim. ChatGov e Diário Oficial podem ser contratados de forma independente ou em conjunto. Quando usados juntos, compartilham a mesma base de gestão e identidade visual do órgão.",
  },
  {
    q: "Quanto tempo leva a implantação?",
    a: "A maioria dos órgãos entra em operação em poucos dias. O prazo varia conforme a quantidade de canais, integrações e o volume de conteúdo histórico a ser migrado.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {FAQS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-outline-variant bg-surface transition-colors hover:border-primary-200"
          >
            <h3>
              <button
                type="button"
                id={`faq-trigger-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-surface-variant/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <span className="font-semibold text-primary-900">{item.q}</span>
                <Icon
                  name="expand_more"
                  className={`flex-shrink-0 text-primary-600 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
            </h3>
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-trigger-${i}`}
              className={`grid transition-all duration-300 ease-out ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-6 pb-5 text-body-md text-on-surface-variant">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
