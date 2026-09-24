import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { type LegalSection } from "@/components/legal/LegalShell";
import { LEGAL_INFO } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidade — GovSistem",
  description:
    "Como o GovSistem trata, armazena, compartilha e protege dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
};

const dpo = LEGAL_INFO.encarregado
  ? `${LEGAL_INFO.encarregado} (${LEGAL_INFO.emailDpo})`
  : LEGAL_INFO.emailDpo;

const sections: LegalSection[] = [
  {
    id: "escopo",
    title: "Escopo e a quem se aplica",
    content: (
      <>
        <p>
          Esta Política descreve como a <strong>{LEGAL_INFO.razaoSocial}</strong> (&ldquo;GovSistem&rdquo;)
          trata dados pessoais no Painel Administrativo e nos módulos da plataforma — entre eles
          ChatGov, Diário Oficial Eletrônico, GovTask, GovDoc, GovSocial e demais soluções
          contratadas pelo órgão público.
        </p>
        <p>Ela se aplica a três grupos de titulares:</p>
        <ul>
          <li>
            <strong>Usuários do painel</strong> — servidores, gestores e prestadores autorizados pelo
            órgão contratante a acessar o sistema.
          </li>
          <li>
            <strong>Cidadãos</strong> cujos dados são inseridos ou gerados nos módulos pelo órgão
            público no exercício de suas competências.
          </li>
          <li>
            <strong>Visitantes</strong> das páginas públicas da plataforma.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "papeis",
    title: "Papéis: controlador e operador",
    content: (
      <>
        <p>
          A LGPD distingue quem decide sobre o tratamento (<strong>controlador</strong>) de quem trata
          os dados em nome de terceiro (<strong>operador</strong>), nos termos do art. 5º, VI e VII.
          Na plataforma essa divisão é a seguinte:
        </p>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Situação</th>
                <th>Controlador</th>
                <th>Papel do GovSistem</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Dados de cidadãos inseridos ou gerados nos módulos pelo órgão</td>
                <td>O órgão público contratante</td>
                <td>Operador — trata os dados apenas conforme instruções do controlador</td>
              </tr>
              <tr>
                <td>Contas de acesso, logs de autenticação e trilhas de auditoria do painel</td>
                <td>GovSistem, em conjunto com o órgão contratante</td>
                <td>Controlador quanto à segurança e ao faturamento do serviço</td>
              </tr>
              <tr>
                <td>Contato comercial, suporte técnico e páginas públicas</td>
                <td>GovSistem</td>
                <td>Controlador</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Quando o GovSistem atua como operador, solicitações de titulares recebidas por nós são
          encaminhadas ao órgão controlador, que é quem detém competência para decidir sobre elas.
        </p>
      </>
    ),
  },
  {
    id: "dados",
    title: "Dados pessoais tratados",
    content: (
      <>
        <h3>Fornecidos por você ou pelo órgão</h3>
        <ul>
          <li>
            <strong>Identificação e contato:</strong> nome, e-mail institucional, CPF, telefone,
            cargo, órgão/secretaria de lotação e foto de perfil (quando enviada).
          </li>
          <li>
            <strong>Credenciais:</strong> senha (armazenada apenas como hash criptográfico, nunca em
            texto legível) e segredos de autenticação em dois fatores, quando habilitada.
          </li>
          <li>
            <strong>Conteúdo operacional:</strong> documentos, processos, atendimentos, publicações e
            demais registros inseridos nos módulos pelo órgão no exercício de suas atribuições.
          </li>
        </ul>
        <h3>Coletados automaticamente</h3>
        <ul>
          <li>
            <strong>Registros de acesso e de aplicação:</strong> endereço IP, data e hora, navegador,
            sistema operacional e ações realizadas — mantidos também para cumprir o art. 15 do Marco
            Civil da Internet (Lei nº 12.965/2014).
          </li>
          <li>
            <strong>Trilha de auditoria:</strong> quem criou, alterou, aprovou ou excluiu cada
            registro relevante, com data e hora.
          </li>
        </ul>
        <div className="legal-callout">
          <p>
            <strong>Dados sensíveis.</strong> Alguns módulos podem tratar dados sensíveis (art. 5º,
            II) — por exemplo, dados de saúde ou de assistência social no GovSocial. Esse tratamento
            ocorre exclusivamente por determinação do órgão controlador, com fundamento na execução
            de políticas públicas (art. 11, II, &ldquo;b&rdquo;) e sob controles de acesso restritos por perfil.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "finalidades",
    title: "Finalidades, bases legais e prazos",
    content: (
      <>
        <p>
          Cada tratamento tem finalidade determinada e base legal própria (arts. 7º e 11 da LGPD).
          Não utilizamos dados para finalidades incompatíveis com as informadas abaixo.
        </p>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Finalidade</th>
                <th>Dados</th>
                <th>Base legal</th>
                <th>Retenção</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Criar e manter contas de acesso ao painel</td>
                <td>Identificação, contato, credenciais</td>
                <td>Execução de contrato (art. 7º, V)</td>
                <td>Enquanto durar o vínculo do usuário com o órgão</td>
              </tr>
              <tr>
                <td>Autenticar acessos e prevenir fraudes</td>
                <td>Credenciais, IP, registros de acesso</td>
                <td>Cumprimento de obrigação legal (art. 7º, II) e legítimo interesse (art. 7º, IX)</td>
                <td>Mínimo de 6 meses (art. 15 do Marco Civil)</td>
              </tr>
              <tr>
                <td>Executar as políticas públicas suportadas pelos módulos</td>
                <td>Conteúdo operacional e dados de cidadãos</td>
                <td>Execução de políticas públicas (art. 7º, III; art. 11, II, &ldquo;b&rdquo;)</td>
                <td>Conforme tabela de temporalidade do órgão controlador</td>
              </tr>
              <tr>
                <td>Publicidade de atos oficiais no Diário Oficial</td>
                <td>Dados constantes dos atos publicados</td>
                <td>Cumprimento de obrigação legal (art. 7º, II)</td>
                <td>Permanente, por exigência do princípio da publicidade</td>
              </tr>
              <tr>
                <td>Auditoria, apuração de responsabilidade e segurança</td>
                <td>Trilhas de auditoria</td>
                <td>Legítimo interesse e obrigação legal (art. 7º, II e IX)</td>
                <td>Até 5 anos após o registro</td>
              </tr>
              <tr>
                <td>Suporte técnico e comunicação de serviço</td>
                <td>Identificação, contato, descrição do chamado</td>
                <td>Execução de contrato (art. 7º, V)</td>
                <td>Até 5 anos após o encerramento do chamado</td>
              </tr>
              <tr>
                <td>Faturamento e obrigações fiscais</td>
                <td>Dados de contratação e de cobrança</td>
                <td>Cumprimento de obrigação legal (art. 7º, II)</td>
                <td>Prazos da legislação fiscal (em regra, 5 anos)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies e armazenamento no navegador",
    content: (
      <>
        <p>
          O Painel Administrativo usa armazenamento local do navegador (<em>localStorage</em>) para
          guardar o token da sessão autenticada e preferências de interface, como o e-mail lembrado
          na tela de login quando você marca essa opção. São recursos estritamente necessários ao
          funcionamento do sistema.
        </p>
        <ul>
          <li>
            <strong>Não utilizamos</strong> cookies de publicidade, de redes sociais ou de
            rastreamento entre sites no painel.
          </li>
          <li>
            Limpar os dados do site no navegador encerra a sessão e remove o e-mail lembrado.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "compartilhamento",
    title: "Compartilhamento e operadores",
    content: (
      <>
        <p>
          <strong>Não vendemos dados pessoais.</strong> O compartilhamento ocorre apenas nas
          hipóteses abaixo, sempre limitado ao necessário:
        </p>
        <ul>
          <li>
            <strong>Com o órgão contratante</strong>, titular dos dados operacionais tratados na
            plataforma.
          </li>
          <li>
            <strong>Com fornecedores que atuam como operadores</strong> em nome do GovSistem —
            infraestrutura de nuvem e hospedagem, envio de e-mail transacional, provedores de
            mensageria utilizados pelos módulos de atendimento e serviços de assinatura digital —
            todos vinculados contratualmente a obrigações de confidencialidade e segurança.
          </li>
          <li>
            <strong>Com autoridades públicas</strong>, quando houver requisição legal, ordem judicial
            ou determinação da Autoridade Nacional de Proteção de Dados (ANPD).
          </li>
        </ul>
        <p>
          A relação atualizada de operadores que tratam dados em nome da plataforma pode ser
          solicitada pelo órgão controlador a qualquer momento pelo canal do Encarregado.
        </p>
      </>
    ),
  },
  {
    id: "transferencia",
    title: "Transferência internacional",
    content: (
      <>
        <p>
          A infraestrutura principal da plataforma está hospedada no Brasil. Caso algum serviço
          acessório envolva tratamento fora do país, a transferência observará os arts. 33 a 36 da
          LGPD, com garantias contratuais de nível de proteção equivalente ao da legislação
          brasileira. O órgão controlador é informado previamente sempre que isso for relevante para
          os dados sob sua responsabilidade.
        </p>
      </>
    ),
  },
  {
    id: "retencao",
    title: "Retenção e eliminação",
    content: (
      <>
        <p>
          Os dados são mantidos pelo tempo necessário às finalidades informadas ou pelos prazos
          exigidos em lei — o que for maior. Encerrado o contrato, o órgão contratante pode solicitar
          a exportação de seus dados; após o prazo acordado para essa exportação, os dados são
          eliminados ou anonimizados, ressalvadas as hipóteses do art. 16 da LGPD (cumprimento de
          obrigação legal, estudo por órgão de pesquisa, transferência a terceiro com observância da
          lei e uso exclusivo do controlador em forma anonimizada).
        </p>
        <p>
          Cópias de segurança (<em>backups</em>) seguem ciclo próprio de expiração e, por isso, um
          dado eliminado da base ativa pode permanecer em backup até o vencimento natural do ciclo,
          sem uso para qualquer outra finalidade.
        </p>
      </>
    ),
  },
  {
    id: "seguranca",
    title: "Segurança da informação",
    content: (
      <>
        <p>
          Adotamos medidas técnicas e administrativas para proteger os dados contra acessos não
          autorizados e situações acidentais ou ilícitas de destruição, perda, alteração ou difusão —
          entre elas criptografia em trânsito (HTTPS/TLS), senhas armazenadas com algoritmo de hash,
          controle de acesso por perfil, autenticação em dois fatores, segregação por organização
          (multi-tenant), trilhas de auditoria e rotinas de backup.
        </p>
        <p>
          Os controles estão descritos em detalhe na{" "}
          <Link href="/seguranca">Política de Segurança</Link>.
        </p>
      </>
    ),
  },
  {
    id: "direitos",
    title: "Direitos do titular",
    content: (
      <>
        <p>
          A qualquer momento, mediante requisição, o titular pode exercer os direitos previstos no
          art. 18 da LGPD:
        </p>
        <ul>
          <li>Confirmação da existência de tratamento e acesso aos dados.</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
          <li>
            Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em
            desconformidade com a lei.
          </li>
          <li>Portabilidade a outro fornecedor, observados os segredos comercial e industrial.</li>
          <li>
            Eliminação dos dados tratados com base no consentimento, ressalvadas as hipóteses do art.
            16.
          </li>
          <li>Informação sobre as entidades com as quais houve uso compartilhado.</li>
          <li>
            Informação sobre a possibilidade de não fornecer consentimento e sobre as consequências
            da negativa.
          </li>
          <li>Revogação do consentimento, quando essa for a base legal aplicável.</li>
          <li>Revisão de decisões tomadas unicamente com base em tratamento automatizado.</li>
        </ul>
        <div className="legal-callout">
          <p>
            <strong>Como exercer.</strong> Envie a solicitação para{" "}
            <a href={`mailto:${LEGAL_INFO.emailDpo}`}>{LEGAL_INFO.emailDpo}</a> com o assunto
            &ldquo;LGPD — direitos do titular&rdquo;, informando o pedido e elementos que permitam
            confirmar sua identidade. Respondemos em até <strong>15 dias</strong> (art. 19, II).
            Quando o pedido envolver dados em que o órgão público é o controlador, encaminhamos a
            requisição a ele e informamos você desse encaminhamento.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "automatizado",
    title: "Decisões automatizadas e uso de IA",
    content: (
      <>
        <p>
          Alguns módulos utilizam automações e recursos de inteligência artificial para triar
          atendimentos, sugerir respostas, classificar documentos e apoiar análises. Esses recursos
          têm caráter <strong>auxiliar</strong>: decisões com efeitos jurídicos ou impacto relevante
          sobre o cidadão permanecem sob responsabilidade de servidor humano do órgão.
        </p>
        <p>
          O titular pode solicitar revisão de decisão tomada unicamente com base em tratamento
          automatizado (art. 20 da LGPD) pelo canal do Encarregado.
        </p>
      </>
    ),
  },
  {
    id: "criancas",
    title: "Crianças e adolescentes",
    content: (
      <>
        <p>
          O tratamento de dados de crianças e adolescentes ocorre apenas quando necessário à execução
          de políticas públicas conduzidas pelo órgão — por exemplo, em programas de assistência
          social ou educação — sempre em seu melhor interesse e nos termos do art. 14 da LGPD, com
          acesso restrito aos servidores designados para essa finalidade.
        </p>
      </>
    ),
  },
  {
    id: "incidentes",
    title: "Incidentes de segurança",
    content: (
      <>
        <p>
          Mantemos plano de resposta a incidentes. Identificado incidente de segurança que possa
          acarretar risco ou dano relevante aos titulares, comunicamos o órgão controlador em prazo
          razoável para que este cumpra o dever de notificação à ANPD e aos titulares (art. 48 da
          LGPD), prestando as informações técnicas necessárias sobre natureza dos dados, titulares
          envolvidos, medidas adotadas e riscos.
        </p>
      </>
    ),
  },
  {
    id: "encarregado",
    title: "Encarregado pelo tratamento de dados (DPO)",
    content: (
      <>
        <p>
          Em atendimento ao art. 41 da LGPD, o canal de comunicação com o Encarregado do GovSistem é{" "}
          <a href={`mailto:${LEGAL_INFO.emailDpo}`}>{dpo}</a>. Ele recebe reclamações e comunicações
          de titulares, presta esclarecimentos e adota providências, além de ser o ponto de contato
          com a ANPD.
        </p>
        <p>
          Para dados sob controle do órgão público, o titular também pode acionar o Encarregado
          designado pelo próprio ente, indicado no portal oficial do órgão.
        </p>
      </>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações desta política",
    content: (
      <>
        <p>
          Esta Política pode ser atualizada para refletir mudanças legais, técnicas ou de negócio. A
          versão vigente é sempre a publicada nesta página, com data de atualização no topo.
          Alterações relevantes são comunicadas aos órgãos contratantes pelos canais oficiais antes
          de entrarem em vigor.
        </p>
      </>
    ),
  },
];

export default function PrivacidadePage() {
  return (
    <LegalShell
      slug="privacidade"
      title="Política de Privacidade e Proteção de Dados"
      intro="Quais dados pessoais tratamos na plataforma GovSistem, com que finalidade e base legal, por quanto tempo e como você exerce seus direitos como titular."
      chips={["LGPD — Lei nº 13.709/2018", "Marco Civil da Internet"]}
      sections={sections}
    />
  );
}
