import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Política de Privacidade — GovSistem",
  description: "Como o GovSistem coleta, utiliza e protege dados pessoais em conformidade com a LGPD.",
};

export default function PrivacidadePage() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      intro="Como tratamos, armazenamos e protegemos os dados pessoais em nossas plataformas, em conformidade com a Lei Geral de Proteção de Dados (LGPD)."
      updatedAt="Junho de 2026"
    >
      <h2>1. Dados que coletamos</h2>
      <p>
        Coletamos apenas os dados necessários para a prestação do serviço, tais como informações de
        cadastro de usuários do órgão público, dados de atendimento gerados no ChatGov e registros
        técnicos de acesso (endereço IP, data, hora e tipo de navegador) para segurança.
      </p>

      <h2>2. Finalidade do tratamento</h2>
      <ul>
        <li>Operação e melhoria contínua das plataformas.</li>
        <li>Atendimento ao cidadão e geração de protocolos.</li>
        <li>Cumprimento de obrigações legais e do dever de publicidade dos atos oficiais.</li>
        <li>Segurança da informação e prevenção a fraudes.</li>
      </ul>

      <h2>3. Base legal</h2>
      <p>
        O tratamento ocorre com fundamento na execução de contrato, no cumprimento de obrigação
        legal/regulatória e no exercício regular de competências pelo poder público, nos termos da
        LGPD (Lei nº 13.709/2018).
      </p>

      <h2>4. Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo criptografia
        em trânsito e em repouso, controle de acesso por perfil e registros de auditoria das
        operações realizadas na plataforma.
      </p>

      <h2>5. Direitos do titular</h2>
      <p>
        O titular pode solicitar confirmação de tratamento, acesso, correção, anonimização e
        portabilidade de seus dados, observadas as limitações legais aplicáveis ao setor público.
      </p>

      <h2>6. Contato do Encarregado (DPO)</h2>
      <p>
        Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de dados, entre em
        contato pelo e-mail{" "}
        <a href="mailto:contato@govsistem.com.br">contato@govsistem.com.br</a>.
      </p>
    </LegalLayout>
  );
}
