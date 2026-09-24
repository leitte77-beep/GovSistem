import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Termos de Uso — GovSistem",
  description: "Termos e condições de uso das plataformas GovSistem (ChatGov e Diário Oficial Eletrônico).",
};

export default function TermosPage() {
  return (
    <LegalLayout
      title="Termos de Uso"
      intro="Condições gerais que regem o acesso e a utilização das plataformas GovSistem. Ao utilizar nossos serviços, você concorda com os termos abaixo."
      updatedAt="Junho de 2026"
    >
      <h2>1. Aceitação dos termos</h2>
      <p>
        Ao acessar ou utilizar as soluções GovSistem — incluindo o ChatGov e o Diário Oficial
        Eletrônico —, o usuário declara ter lido, compreendido e aceitado integralmente estes
        Termos de Uso, bem como a nossa Política de Privacidade.
      </p>

      <h2>2. Descrição dos serviços</h2>
      <p>
        O GovSistem é uma plataforma SaaS destinada a órgãos públicos para automação do
        atendimento ao cidadão e publicação de atos oficiais. Os serviços são fornecidos no
        modelo de assinatura, conforme contrato firmado com cada ente público.
      </p>

      <h2>3. Responsabilidades do contratante</h2>
      <ul>
        <li>Manter a confidencialidade das credenciais de acesso de seus usuários.</li>
        <li>Garantir a veracidade e a legalidade dos conteúdos publicados.</li>
        <li>Utilizar a plataforma em conformidade com a legislação aplicável.</li>
      </ul>

      <h2>4. Disponibilidade e suporte</h2>
      <p>
        Empenhamo-nos em manter alta disponibilidade do serviço, conforme o nível acordado (SLA)
        em contrato. Eventuais janelas de manutenção programada serão comunicadas com antecedência.
      </p>

      <h2>5. Propriedade intelectual</h2>
      <p>
        O software, a marca e os elementos visuais do GovSistem são protegidos por direitos de
        propriedade intelectual. Os dados e conteúdos inseridos pelo órgão público permanecem de
        sua titularidade.
      </p>

      <h2>6. Alterações</h2>
      <p>
        Estes termos podem ser atualizados periodicamente. Mudanças relevantes serão comunicadas
        pelos canais oficiais. Em caso de dúvidas, escreva para{" "}
        <a href="mailto:contato@govsistem.com.br">contato@govsistem.com.br</a>.
      </p>
    </LegalLayout>
  );
}
