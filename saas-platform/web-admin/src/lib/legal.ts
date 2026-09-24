/**
 * Dados institucionais usados nas páginas legais (Termos, Privacidade, Ajuda,
 * Segurança). Centralizados aqui para que a revisão jurídica precise editar um
 * único arquivo — os textos das páginas consomem estas constantes.
 *
 * IMPORTANTE: os campos marcados com "revisar" devem ser confirmados pelo
 * jurídico antes da publicação (razão social, CNPJ, endereço e o nome do
 * Encarregado exigido pelo art. 41 da LGPD).
 */
export const LEGAL_INFO = {
  produto: "GovSistem",
  /** revisar */
  razaoSocial: "GovSistem Tecnologia LTDA",
  /** revisar */
  cnpj: "00.000.000/0001-00",
  /** revisar */
  endereco: "Brasil",
  site: "https://govsistem.com.br",
  emailContato: "contato@govsistem.com.br",
  /** Canal do Encarregado (DPO). Trocar por dpo@ quando a caixa existir. */
  emailDpo: "contato@govsistem.com.br",
  /** Canal para reporte de vulnerabilidades e incidentes de segurança. */
  emailSeguranca: "contato@govsistem.com.br",
  /**
   * Nome do Encarregado pelo Tratamento de Dados Pessoais (art. 41, §1º, LGPD).
   * Enquanto vazio, as páginas divulgam apenas o canal de contato.
   */
  encarregado: "",
  atualizadoEm: "20 de agosto de 2026",
  versaoDocumentos: "1.0",
} as const;

export type LegalDocSlug = "termos" | "privacidade" | "ajuda" | "seguranca";

export interface LegalDoc {
  slug: LegalDocSlug;
  href: string;
  label: string;
  short: string;
  icon: string;
}

/** Ordem usada na navegação entre documentos e no rodapé do login. */
export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "termos",
    href: "/termos",
    label: "Termos de Uso",
    short: "Regras de acesso e uso da plataforma",
    icon: "gavel",
  },
  {
    slug: "privacidade",
    href: "/privacidade",
    label: "Privacidade",
    short: "Tratamento de dados pessoais e LGPD",
    icon: "privacy_tip",
  },
  {
    slug: "ajuda",
    href: "/ajuda",
    label: "Ajuda",
    short: "Primeiro acesso, senha e suporte",
    icon: "help",
  },
  {
    slug: "seguranca",
    href: "/seguranca",
    label: "Segurança",
    short: "Controles, incidentes e boas práticas",
    icon: "shield",
  },
];
