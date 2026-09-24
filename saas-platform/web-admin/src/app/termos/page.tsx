import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { type LegalSection } from "@/components/legal/LegalShell";
import { LEGAL_INFO } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Termos de Uso — GovSistem",
  description:
    "Condições que regem o acesso e o uso do Painel Administrativo e dos módulos da plataforma GovSistem por órgãos públicos e seus usuários autorizados.",
};

const sections: LegalSection[] = [
  {
    id: "aceitacao",
    title: "Aceitação",
    content: (
      <>
        <p>
          Estes Termos regem o acesso e o uso do Painel Administrativo e dos módulos da plataforma{" "}
          <strong>{LEGAL_INFO.produto}</strong>, fornecida por {LEGAL_INFO.razaoSocial}, CNPJ{" "}
          {LEGAL_INFO.cnpj}. Ao efetuar login, você declara ter lido e aceitado integralmente estes
          Termos e a <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
        <p>
          Em caso de divergência entre estes Termos e o contrato administrativo firmado com o órgão
          público, <strong>prevalece o contrato</strong> e seus anexos técnicos.
        </p>
      </>
    ),
  },
  {
    id: "definicoes",
    title: "Definições",
    content: (
      <ul>
        <li>
          <strong>Plataforma:</strong> o conjunto de sistemas GovSistem, incluindo o Painel
          Administrativo e os módulos contratados.
        </li>
        <li>
          <strong>Contratante:</strong> o órgão ou entidade pública que contrata o serviço.
        </li>
        <li>
          <strong>Usuário:</strong> pessoa física autorizada pelo Contratante a acessar a Plataforma
          com credenciais individuais.
        </li>
        <li>
          <strong>Dados do Contratante:</strong> informações inseridas ou geradas pelo Contratante e
          por seus Usuários no uso da Plataforma.
        </li>
      </ul>
    ),
  },
  {
    id: "servico",
    title: "Descrição do serviço",
    content: (
      <>
        <p>
          O GovSistem é uma solução <em>SaaS</em> (software como serviço) destinada à administração
          pública, disponibilizada pela internet no modelo de assinatura, com módulos ativados
          conforme o contrato — atendimento ao cidadão, diário oficial eletrônico, gestão de
          processos e obras, documentos, assistência social, entre outros.
        </p>
        <p>
          A Plataforma é fornecida em ambiente compartilhado com <strong>segregação lógica por
          organização</strong>: cada Contratante acessa exclusivamente os seus próprios dados.
        </p>
        <p>
          Podemos evoluir funcionalidades, corrigir falhas e ajustar a interface a qualquer momento.
          Mudanças que reduzam funcionalidades essenciais contratadas são comunicadas previamente ao
          Contratante.
        </p>
      </>
    ),
  },
  {
    id: "contas",
    title: "Contas e credenciais",
    content: (
      <>
        <ul>
          <li>
            As credenciais são <strong>pessoais e intransferíveis</strong>. É vedado compartilhar
            login e senha, inclusive entre servidores da mesma equipe.
          </li>
          <li>
            O Contratante é responsável por criar, revisar e revogar acessos, especialmente no
            desligamento ou mudança de lotação de servidores.
          </li>
          <li>
            Recomendamos fortemente a ativação da autenticação em dois fatores para perfis
            administrativos.
          </li>
          <li>
            Todo ato praticado com as credenciais de um Usuário presume-se por ele praticado, salvo
            comprovação em contrário — as trilhas de auditoria registram autoria, data e hora.
          </li>
          <li>
            Suspeita de comprometimento de credenciais deve ser comunicada imediatamente pelo canal
            indicado em <Link href="/seguranca">Segurança</Link>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "uso-aceitavel",
    title: "Uso aceitável",
    content: (
      <>
        <p>O Usuário compromete-se a não:</p>
        <ul>
          <li>
            Acessar dados de cidadãos sem finalidade administrativa legítima — a consulta por
            curiosidade ou interesse pessoal é vedada e sujeita a responsabilização.
          </li>
          <li>Publicar conteúdo ilícito, ofensivo ou que viole direitos de terceiros.</li>
          <li>
            Tentar burlar mecanismos de autenticação, autorização, limitação de uso ou auditoria.
          </li>
          <li>
            Realizar testes de intrusão, varreduras, engenharia reversa ou extração automatizada em
            massa sem autorização formal prévia.
          </li>
          <li>
            Usar a Plataforma para envio de comunicações não solicitadas alheias à finalidade
            pública do serviço.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "responsabilidades",
    title: "Responsabilidades do Contratante",
    content: (
      <ul>
        <li>
          Garantir a veracidade, a legalidade e a atualização dos conteúdos publicados, em especial
          dos atos oficiais.
        </li>
        <li>
          Definir a base legal do tratamento dos dados de cidadãos inseridos na Plataforma, na
          qualidade de <strong>controlador</strong> (vide{" "}
          <Link href="/privacidade">Política de Privacidade</Link>).
        </li>
        <li>Manter equipamentos, rede e navegadores dos Usuários em condições adequadas de uso.</li>
        <li>Observar suas próprias tabelas de temporalidade e políticas de arquivo.</li>
      </ul>
    ),
  },
  {
    id: "dados",
    title: "Dados do Contratante e proteção de dados",
    content: (
      <>
        <p>
          Os Dados do Contratante <strong>permanecem de sua titularidade</strong>. O GovSistem os
          trata como operador, exclusivamente para prestar o serviço e conforme as instruções
          documentadas do Contratante, nos termos dos arts. 39 e seguintes da LGPD.
        </p>
        <p>
          Não utilizamos os Dados do Contratante para finalidade própria, não os comercializamos e
          não os empregamos para treinar modelos de inteligência artificial de terceiros sem
          autorização expressa e formal do Contratante.
        </p>
        <p>
          Ao término do contrato, o Contratante pode solicitar a exportação de seus dados em formato
          estruturado, observado o prazo previsto contratualmente, após o qual os dados são
          eliminados ou anonimizados.
        </p>
      </>
    ),
  },
  {
    id: "disponibilidade",
    title: "Disponibilidade, manutenção e suporte",
    content: (
      <>
        <p>
          Empenhamo-nos em manter a Plataforma disponível de forma contínua, no nível de serviço
          (SLA) acordado em contrato. Janelas de manutenção programada são comunicadas com
          antecedência e realizadas, sempre que possível, fora do horário de expediente.
        </p>
        <p>
          Não se caracterizam indisponibilidade do serviço as interrupções decorrentes de falhas na
          rede do Contratante, de serviços de terceiros alheios ao nosso controle ou de caso fortuito
          e força maior. Os canais de suporte estão descritos na página de{" "}
          <Link href="/ajuda">Ajuda</Link>.
        </p>
      </>
    ),
  },
  {
    id: "propriedade",
    title: "Propriedade intelectual",
    content: (
      <p>
        O software, o código-fonte, a marca, a identidade visual e a documentação do GovSistem são
        protegidos pela legislação de propriedade intelectual e permanecem de titularidade da{" "}
        {LEGAL_INFO.razaoSocial}. O contrato concede ao Contratante licença de uso não exclusiva,
        intransferível e limitada ao prazo da assinatura, vedada a sublicença, a cessão ou a
        reprodução do software fora das hipóteses previstas em contrato.
      </p>
    ),
  },
  {
    id: "confidencialidade",
    title: "Confidencialidade",
    content: (
      <p>
        As partes obrigam-se a manter sigilo sobre informações confidenciais a que tiverem acesso em
        razão do serviço, inclusive após o término do contrato. Nossa equipe técnica acessa dados do
        Contratante apenas quando necessário à prestação do suporte ou à manutenção do serviço,
        mediante registro do acesso.
      </p>
    ),
  },
  {
    id: "suspensao",
    title: "Suspensão e encerramento",
    content: (
      <>
        <p>O acesso pode ser suspenso, total ou parcialmente, nas seguintes hipóteses:</p>
        <ul>
          <li>Uso da Plataforma em desacordo com estes Termos ou com a legislação.</li>
          <li>
            Risco concreto à segurança da Plataforma ou aos dados de outros Contratantes, pelo tempo
            necessário à contenção.
          </li>
          <li>Inadimplemento contratual, observados os prazos e as comunicações previstas.</li>
        </ul>
        <p>
          Salvo risco iminente de segurança, a suspensão é precedida de comunicação ao Contratante
          com prazo para regularização.
        </p>
      </>
    ),
  },
  {
    id: "limitacao",
    title: "Limitação de responsabilidade",
    content: (
      <p>
        O GovSistem responde nos limites estabelecidos no contrato administrativo e na legislação
        aplicável. Não respondemos pelo conteúdo dos atos e documentos publicados pelo Contratante,
        pela exatidão das informações por ele inseridas nem por decisões administrativas tomadas com
        apoio nas funcionalidades da Plataforma.
      </p>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações destes Termos",
    content: (
      <p>
        Estes Termos podem ser atualizados a qualquer tempo. A versão vigente é a publicada nesta
        página, com a respectiva data de atualização. Alterações relevantes são comunicadas ao
        Contratante pelos canais oficiais; o uso continuado da Plataforma após a comunicação implica
        concordância com a nova versão.
      </p>
    ),
  },
  {
    id: "foro",
    title: "Legislação aplicável e foro",
    content: (
      <p>
        Aplicam-se a estes Termos as leis brasileiras, em especial a Lei nº 14.133/2021 (quando
        pertinente à contratação pública), a Lei nº 13.709/2018 (LGPD), a Lei nº 12.965/2014 (Marco
        Civil da Internet) e a Lei nº 12.527/2011 (Acesso à Informação). Fica eleito o foro definido
        no contrato administrativo para dirimir controvérsias; na ausência de previsão, o foro do
        domicílio do Contratante. Dúvidas podem ser encaminhadas para{" "}
        <a href={`mailto:${LEGAL_INFO.emailContato}`}>{LEGAL_INFO.emailContato}</a>.
      </p>
    ),
  },
];

export default function TermosPage() {
  return (
    <LegalShell
      slug="termos"
      title="Termos de Uso da Plataforma"
      intro="Condições gerais de acesso e uso do Painel Administrativo e dos módulos GovSistem por órgãos públicos contratantes e seus usuários autorizados."
      chips={["Uso institucional", "Complementar ao contrato"]}
      sections={sections}
    />
  );
}
