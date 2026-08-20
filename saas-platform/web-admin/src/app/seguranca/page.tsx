import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { type LegalSection } from "@/components/legal/LegalShell";
import { LEGAL_INFO } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Segurança da Informação — GovSistem",
  description:
    "Controles técnicos e organizacionais adotados pelo GovSistem, política de divulgação responsável de vulnerabilidades e boas práticas para usuários.",
};

const sections: LegalSection[] = [
  {
    id: "principios",
    title: "Princípios",
    content: (
      <>
        <p>
          A plataforma trata dados de interesse público e informações pessoais de cidadãos. Por isso,
          a segurança é tratada como requisito de projeto, e não como camada adicional: menor
          privilégio, defesa em profundidade, rastreabilidade de todas as ações relevantes e
          segregação estrita entre organizações.
        </p>
        <p>
          Esta página descreve os controles em vigor e complementa a{" "}
          <Link href="/privacidade">Política de Privacidade</Link>, que trata do uso dos dados
          pessoais.
        </p>
      </>
    ),
  },
  {
    id: "controles",
    title: "Controles técnicos",
    content: (
      <>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Área</th>
                <th>Controle adotado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Transporte</td>
                <td>Todo o tráfego é servido sobre HTTPS/TLS, com certificados renovados automaticamente.</td>
              </tr>
              <tr>
                <td>Credenciais</td>
                <td>
                  Senhas armazenadas apenas como hash com algoritmo de derivação lento e salt; nunca
                  em texto legível nem recuperáveis pela equipe técnica.
                </td>
              </tr>
              <tr>
                <td>Autenticação</td>
                <td>
                  Sessões com token de expiração curta, renovação controlada e autenticação em dois
                  fatores (2FA) disponível por conta.
                </td>
              </tr>
              <tr>
                <td>Autorização</td>
                <td>
                  Controle de acesso baseado em papéis (RBAC) por módulo e por organização, com
                  permissões concedidas no menor privilégio necessário.
                </td>
              </tr>
              <tr>
                <td>Isolamento</td>
                <td>
                  Arquitetura multi-tenant com segregação lógica: consultas são sempre delimitadas
                  pela organização do usuário autenticado.
                </td>
              </tr>
              <tr>
                <td>Auditoria</td>
                <td>
                  Registro de autoria, data, hora e origem das operações sensíveis, preservado para
                  apuração de responsabilidade.
                </td>
              </tr>
              <tr>
                <td>Backups</td>
                <td>
                  Rotinas periódicas de cópia de segurança da base de dados e dos arquivos, com
                  retenção definida e testes de restauração.
                </td>
              </tr>
              <tr>
                <td>Infraestrutura</td>
                <td>
                  Serviços isolados em contêineres, exposição de portas restrita à borda, firewall na
                  entrada e atualização periódica de dependências e sistema operacional.
                </td>
              </tr>
              <tr>
                <td>Segredos</td>
                <td>
                  Chaves e credenciais de integração mantidas fora do código-fonte, com rotação em
                  caso de suspeita de exposição.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "organizacionais",
    title: "Controles organizacionais",
    content: (
      <ul>
        <li>Acesso da equipe técnica a ambientes de produção restrito e concedido por necessidade.</li>
        <li>Compromisso formal de confidencialidade de toda a equipe com acesso a dados.</li>
        <li>Revisão de código e testes automatizados antes da liberação de novas versões.</li>
        <li>Registro das operações de suporte que envolvam acesso a dados do contratante.</li>
        <li>Revisão periódica de permissões e desativação de contas sem uso.</li>
      </ul>
    ),
  },
  {
    id: "incidentes",
    title: "Resposta a incidentes",
    content: (
      <>
        <p>Diante de um incidente de segurança, o fluxo é:</p>
        <ol>
          <li>
            <strong>Contenção</strong> — isolamento do vetor, revogação de credenciais e bloqueio de
            acessos comprometidos.
          </li>
          <li>
            <strong>Investigação</strong> — análise de logs e trilhas de auditoria para determinar
            alcance, dados afetados e causa raiz.
          </li>
          <li>
            <strong>Comunicação</strong> — notificação ao órgão controlador em prazo razoável, com as
            informações necessárias ao cumprimento do art. 48 da LGPD perante a ANPD e os titulares.
          </li>
          <li>
            <strong>Correção e lições aprendidas</strong> — remediação definitiva e ajustes de
            controle para evitar recorrência.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "vulnerabilidades",
    title: "Divulgação responsável de vulnerabilidades",
    content: (
      <>
        <p>
          Pesquisadores de segurança e servidores que identificarem uma possível falha podem
          reportá-la para{" "}
          <a href={`mailto:${LEGAL_INFO.emailSeguranca}`}>{LEGAL_INFO.emailSeguranca}</a>, com o
          assunto &ldquo;Vulnerabilidade&rdquo;. Inclua descrição, passos de reprodução, impacto
          estimado e, se possível, evidências.
        </p>
        <p>Ao reportar, pedimos que você:</p>
        <ul>
          <li>Não acesse, altere ou exfiltre dados de terceiros além do mínimo para demonstrar a falha.</li>
          <li>Não execute ataques de negação de serviço nem testes que degradem o ambiente.</li>
          <li>Conceda prazo razoável para correção antes de qualquer divulgação pública.</li>
        </ul>
        <p>
          Confirmamos o recebimento e mantemos o pesquisador informado sobre o andamento da correção.
          Não há, no momento, programa de recompensa financeira.
        </p>
        <div className="legal-callout legal-callout--warn">
          <p>
            <strong>Testes autorizados.</strong> Testes de intrusão só podem ser realizados mediante
            autorização formal prévia, com escopo e janela definidos. Testes não autorizados violam
            os <Link href="/termos">Termos de Uso</Link> e podem configurar ilícito.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "usuario",
    title: "Boas práticas para o usuário",
    content: (
      <>
        <ul>
          <li>
            Use senha longa e exclusiva desta plataforma; prefira um gerenciador de senhas a
            anotações em papel ou planilhas.
          </li>
          <li>Ative a autenticação em dois fatores, especialmente em perfis administrativos.</li>
          <li>Nunca compartilhe credenciais — solicite um acesso próprio para cada servidor.</li>
          <li>Encerre a sessão ao deixar o computador, sobretudo em equipamentos compartilhados.</li>
          <li>Evite acessar dados sensíveis em redes públicas sem necessidade.</li>
          <li>
            Comunique imediatamente qualquer suspeita de acesso indevido; um acesso comprometido
            detectado cedo tem impacto muito menor.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "phishing",
    title: "Como identificar golpes",
    content: (
      <>
        <div className="legal-callout">
          <p>
            <strong>Nunca solicitamos sua senha</strong> por e-mail, telefone, WhatsApp ou qualquer
            outro canal. Nenhum técnico do GovSistem precisa da sua senha para prestar suporte.
          </p>
        </div>
        <p>Desconfie de mensagens que:</p>
        <ul>
          <li>
            Peçam login e senha, código de 2FA ou instalação de programas de acesso remoto não
            previstos pelo órgão.
          </li>
          <li>Criem urgência (&ldquo;sua conta será bloqueada em 24 horas&rdquo;).</li>
          <li>
            Levem a endereços parecidos com o oficial. Confira sempre o domínio na barra do
            navegador antes de digitar a senha.
          </li>
        </ul>
        <p>
          Em caso de dúvida, não clique: encaminhe a mensagem para{" "}
          <a href={`mailto:${LEGAL_INFO.emailSeguranca}`}>{LEGAL_INFO.emailSeguranca}</a>.
        </p>
      </>
    ),
  },
  {
    id: "responsabilidade-compartilhada",
    title: "Responsabilidade compartilhada",
    content: (
      <>
        <p>A segurança do ambiente depende das duas partes:</p>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>GovSistem</th>
                <th>Órgão contratante</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Infraestrutura, aplicação, criptografia, backups e monitoramento</td>
                <td>Gestão do ciclo de vida das contas de seus servidores</td>
              </tr>
              <tr>
                <td>Correção de vulnerabilidades e atualização de dependências</td>
                <td>Definição de perfis e concessão de permissões adequadas ao cargo</td>
              </tr>
              <tr>
                <td>Registro de auditoria e apoio à investigação de incidentes</td>
                <td>Segurança das estações de trabalho, da rede e da conduta dos usuários</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
];

export default function SegurancaPage() {
  return (
    <LegalShell
      slug="seguranca"
      title="Segurança da Informação"
      intro="Os controles que protegem os dados na plataforma, como reportar uma vulnerabilidade e o que cada parte precisa fazer para manter o ambiente seguro."
      chips={["Divulgação responsável", "Resposta a incidentes"]}
      sections={sections}
    />
  );
}
