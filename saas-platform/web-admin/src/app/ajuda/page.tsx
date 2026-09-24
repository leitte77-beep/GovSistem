import type { Metadata } from "next";
import Link from "next/link";
import LegalShell, { type LegalSection } from "@/components/legal/LegalShell";
import { LEGAL_INFO } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Central de Ajuda — GovSistem",
  description:
    "Primeiro acesso, recuperação de senha, autenticação em dois fatores, problemas comuns e canais de suporte do Painel Administrativo GovSistem.",
};

const faq: { q: string; a: React.ReactNode }[] = [
  {
    q: "Esqueci minha senha. O que faço?",
    a: (
      <p>
        Na tela de login, clique em <strong>Esqueceu a senha?</strong> e informe seu e-mail
        institucional. Se houver conta ativa com esse endereço, você receberá um link de redefinição
        válido por 30 minutos. Verifique também a caixa de spam.
      </p>
    ),
  },
  {
    q: "Recebo “E-mail ou senha inválidos” mesmo com a senha certa.",
    a: (
      <ul>
        <li>Confira se o Caps Lock está desligado — a senha diferencia maiúsculas de minúsculas.</li>
        <li>Certifique-se de usar o e-mail institucional cadastrado, sem espaços no início ou fim.</li>
        <li>
          A conta pode ter sido desativada pelo administrador do órgão (por desligamento ou mudança
          de setor). Confirme com ele antes de abrir chamado.
        </li>
      </ul>
    ),
  },
  {
    q: "O sistema me desconecta sozinho.",
    a: (
      <p>
        A sessão expira após um período de inatividade, por segurança. Basta entrar novamente. Se a
        desconexão ocorrer em poucos minutos e de forma repetida, verifique se o navegador está
        bloqueando o armazenamento local do site ou se há uma extensão de privacidade limpando os
        dados.
      </p>
    ),
  },
  {
    q: "Não vejo um módulo ou uma tela que meu colega vê.",
    a: (
      <p>
        O acesso é concedido por perfil e por módulo. Solicite ao administrador do seu órgão a
        liberação da permissão necessária — ele faz isso na tela de Usuários do painel.
      </p>
    ),
  },
  {
    q: "A página apresenta erro ou fica em branco.",
    a: (
      <ul>
        <li>Atualize a página com Ctrl + F5 (ou Cmd + Shift + R no macOS) para descartar cache antigo.</li>
        <li>Teste em uma janela anônima, para isolar extensões do navegador.</li>
        <li>
          Se o erro persistir, registre a data, a hora, o módulo e a mensagem exibida e abra um
          chamado — esses dados aceleram muito o diagnóstico.
        </li>
      </ul>
    ),
  },
  {
    q: "Como ativo a autenticação em dois fatores (2FA)?",
    a: (
      <p>
        Após entrar, abra seu perfil no canto superior do painel e ative a verificação em duas
        etapas. Você precisará de um aplicativo autenticador (Google Authenticator, Authy, Microsoft
        Authenticator ou similar). Guarde os códigos de recuperação em local seguro.
      </p>
    ),
  },
];

const sections: LegalSection[] = [
  {
    id: "primeiro-acesso",
    title: "Primeiro acesso",
    content: (
      <>
        <p>
          O acesso ao Painel Administrativo é criado pelo administrador do seu órgão. Você recebe um
          e-mail com o endereço do painel e as instruções para definir a senha.
        </p>
        <ol>
          <li>Acesse a tela de login e informe seu e-mail institucional.</li>
          <li>Defina uma senha longa e exclusiva desta plataforma.</li>
          <li>Ative a autenticação em dois fatores no seu perfil.</li>
          <li>Confira, no painel inicial, os módulos liberados para o seu perfil.</li>
        </ol>
        <div className="legal-callout">
          <p>
            Não recebeu o convite? Procure o administrador do seu órgão — apenas ele pode criar
            contas e conceder permissões. O suporte técnico não cria acessos por conta própria.
          </p>
        </div>
      </>
    ),
  },
  {
    id: "requisitos",
    title: "Requisitos de uso",
    content: (
      <>
        <ul>
          <li>
            <strong>Navegador:</strong> Google Chrome, Microsoft Edge, Mozilla Firefox ou Safari em
            versão atualizada. Versões antigas do Internet Explorer não são suportadas.
          </li>
          <li>
            <strong>Conexão:</strong> internet estável; algumas telas carregam volumes grandes de
            dados.
          </li>
          <li>
            <strong>Resolução:</strong> o painel é responsivo, mas telas de gestão têm melhor
            aproveitamento a partir de 1280&nbsp;px de largura.
          </li>
          <li>
            <strong>Pop-ups:</strong> mantenha liberada a abertura de janelas para o domínio do
            painel — relatórios e documentos são abertos em nova aba.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "faq",
    title: "Perguntas frequentes",
    content: (
      <div className="legal-faq space-y-2">
        {faq.map((item, i) => (
          <details
            key={i}
            className="group rounded-2xl border border-outline-variant bg-surface-container-lowest px-5 py-4"
          >
            <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-sm font-semibold text-on-surface">
              <span>{item.q}</span>
              <span className="material-symbols-outlined text-[20px] text-primary-600 transition-transform group-open:rotate-180">
                expand_more
              </span>
            </summary>
            <div className="mt-3 text-sm text-on-surface-variant leading-relaxed [&_ul]:mt-2 [&_ul]:space-y-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-on-surface">
              {item.a}
            </div>
          </details>
        ))}
      </div>
    ),
  },
  {
    id: "suporte",
    title: "Canais de suporte",
    content: (
      <>
        <p>
          O atendimento segue o fluxo definido no contrato do seu órgão. Antes de acionar o suporte
          técnico, confirme com o administrador interno se a questão não se resolve com uma
          permissão ou configuração local.
        </p>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assunto</th>
                <th>Canal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Criação de acesso, permissões e perfis</td>
                <td>Administrador do próprio órgão, pela tela de Usuários</td>
              </tr>
              <tr>
                <td>Erro no sistema, lentidão ou indisponibilidade</td>
                <td>
                  <a href={`mailto:${LEGAL_INFO.emailContato}`}>{LEGAL_INFO.emailContato}</a>
                </td>
              </tr>
              <tr>
                <td>Suspeita de acesso indevido ou vulnerabilidade</td>
                <td>
                  <a href={`mailto:${LEGAL_INFO.emailSeguranca}`}>{LEGAL_INFO.emailSeguranca}</a> — veja{" "}
                  <Link href="/seguranca">Segurança</Link>
                </td>
              </tr>
              <tr>
                <td>Dados pessoais e direitos do titular (LGPD)</td>
                <td>
                  <a href={`mailto:${LEGAL_INFO.emailDpo}`}>{LEGAL_INFO.emailDpo}</a> — veja{" "}
                  <Link href="/privacidade">Privacidade</Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Ao abrir um chamado, informe: módulo, tela, o que você esperava que acontecesse, o que
          aconteceu, data e hora aproximadas e, se possível, uma captura de tela.{" "}
          <strong>Nunca envie sua senha</strong> em chamados ou mensagens.
        </p>
      </>
    ),
  },
  {
    id: "lgpd",
    title: "Privacidade e seus direitos",
    content: (
      <>
        <p>
          Se você é cidadão e quer saber quais dados seus são tratados, corrigi-los ou solicitar sua
          eliminação, o pedido deve ser dirigido ao órgão público responsável, que é o controlador
          desses dados. Você também pode escrever para{" "}
          <a href={`mailto:${LEGAL_INFO.emailDpo}`}>{LEGAL_INFO.emailDpo}</a>, e encaminharemos o
          pedido ao órgão competente.
        </p>
        <p>
          O detalhamento das bases legais, dos prazos de resposta e da forma de exercer cada direito
          está na <Link href="/privacidade">Política de Privacidade</Link>.
        </p>
      </>
    ),
  },
  {
    id: "acessibilidade",
    title: "Acessibilidade",
    content: (
      <>
        <p>
          Trabalhamos para que o painel seja utilizável por teclado, com contraste adequado, rótulos
          descritivos em formulários e compatibilidade com leitores de tela, em linha com as
          diretrizes do e-MAG e da WCAG.
        </p>
        <p>
          Encontrou uma barreira de acessibilidade? Descreva a situação para{" "}
          <a href={`mailto:${LEGAL_INFO.emailContato}`}>{LEGAL_INFO.emailContato}</a> — esses relatos
          entram na fila de correção com prioridade.
        </p>
      </>
    ),
  },
];

export default function AjudaPage() {
  return (
    <LegalShell
      slug="ajuda"
      title="Central de Ajuda"
      intro="Como fazer o primeiro acesso, recuperar a senha, resolver os problemas mais comuns e acionar o canal certo para cada tipo de solicitação."
      chips={["Suporte", "Perguntas frequentes"]}
      sections={sections}
    />
  );
}
