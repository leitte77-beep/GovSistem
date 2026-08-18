"use client";

import React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";

interface Item {
  icon: string;
  title: string;
  desc: string;
}

interface Release {
  versao: string;
  periodo: string;
  resumo: string;
  novidades: Item[];
  correcoes: string[];
}

const RELEASES: Release[] = [
  {
    versao: "v1.3.0",
    periodo: "Agosto de 2026",
    resumo:
      "Protocolo Digital dentro do atendimento, painel do cidadão, avisos internos, fila por atendente, agenda pessoal, tema escuro e uma Iris que conduz o primeiro contato.",
    novidades: [
      {
        icon: "confirmation_number",
        title: "Protocolo Digital no atendimento",
        desc: "Gere o protocolo direto da conversa, acompanhe o detalhe de cada um, configure a numeração por órgão e envie o número ao cidadão pelo próprio WhatsApp.",
      },
      {
        icon: "public",
        title: "Portal do cidadão",
        desc: "Página pública para consultar o protocolo pelo número, baixar os documentos emitidos e enviar novos anexos sem precisar ligar para a prefeitura.",
      },
      {
        icon: "contact_page",
        title: "Painel do cidadão na conversa",
        desc: "Aba lateral com cadastro (nome, telefone, CPF, endereço, bairro), primeiro contato, setor e atendente atuais, etiquetas, protocolos e atendimentos anteriores — com copiar telefone e protocolo em um clique. Contato bloqueado aparece em destaque no topo.",
      },
      {
        icon: "history",
        title: "Histórico de movimentações",
        desc: "Linha do tempo do atendimento dentro do painel do cidadão: transferências, mudanças de status, notas internas e ações do painel, com autor e horário de cada uma.",
      },
      {
        icon: "campaign",
        title: "Avisos internos para a equipe",
        desc: "Publique avisos (informativo, importante ou urgente) para todos ou para setores específicos. O aviso aparece flutuando para quem está atendendo e o sistema registra quem já confirmou a leitura.",
      },
      {
        icon: "support_agent",
        title: "Fila pessoal por atendente",
        desc: "Quando o cidadão pede falar com um atendente específico, a conversa entra na fila daquela pessoa, preservando a ordem de chegada e a posição informada ao cidadão.",
      },
      {
        icon: "smart_toy",
        title: "Iris conduz o primeiro contato",
        desc: "A assistente apresenta o menu com os setores ativos do órgão — inclusive quando o cidadão abre a conversa com foto, áudio, vídeo ou documento — e o encaminhamento pela resposta numérica (\"3\") é resolvido de forma determinística, sem depender de interpretação.",
      },
      {
        icon: "event",
        title: "Agenda pessoal",
        desc: "Cada atendente tem sua agenda de compromissos e reuniões, com tipos e campos específicos, lembretes configuráveis e um resumo do dia ao entrar no sistema. Separada da Agenda de contatos.",
      },
      {
        icon: "search",
        title: "Busca dentro da conversa",
        desc: "Procure um termo no histórico do atendimento ignorando maiúsculas e acentos, com destaque nas bolhas e contagem de resultados.",
      },
      {
        icon: "photo_library",
        title: "Central de mídias da conversa",
        desc: "A galeria ganhou busca, filtros por tipo, abas, visualização em grade ou lista, prévia lateral e realce da mensagem original ao clicar em um arquivo.",
      },
      {
        icon: "play_circle",
        title: "Visualizador de arquivos",
        desc: "Lightbox com zoom e navegação, leitor de PDF com controle de páginas, player de vídeo e de áudio próprios (com marcação de áudio já ouvido) e cards de arquivo com nome amigável, sem os códigos gerados pelo WhatsApp.",
      },
      {
        icon: "download",
        title: "Download de documentos do Office",
        desc: "Arquivos DOCX, XLSX e PPTX passaram a baixar com o nome correto e ganharam botão \"Baixar\" — antes só era possível tentar visualizar.",
      },
      {
        icon: "dark_mode",
        title: "Tema escuro",
        desc: "Modo escuro completo, com hierarquia de profundidade, contraste revisado para leitura prolongada e troca de tema aplicada na hora, sem recarregar a página.",
      },
      {
        icon: "view_sidebar",
        title: "Menu lateral e contatos redesenhados",
        desc: "Menu agrupado por área, com indicador da seção ativa, contadores, status da conexão com o WhatsApp e menu de perfil. A tela de contatos ganhou cards compactos, filtros rápidos e prévia do último atendimento.",
      },
      {
        icon: "chat",
        title: "Prévia contextual na lista de conversas",
        desc: "A lista mostra quem enviou a última mensagem e o tipo de mídia com ícone (foto, áudio, vídeo, documento), em vez de um texto genérico.",
      },
      {
        icon: "contact_phone",
        title: "Cartão de contato do WhatsApp",
        desc: "Cartões de contato (vCard) enviados pelo cidadão são recebidos, exibidos na conversa e reaproveitados no cadastro.",
      },
      {
        icon: "upload_file",
        title: "Arrastar e soltar arquivos",
        desc: "Solte o arquivo em qualquer lugar do painel de atendimento para anexá-lo. O limite de envio subiu para 24 MB.",
      },
      {
        icon: "verified",
        title: "Ciclos de atendimento e autorização de conversas",
        desc: "Cada atendimento é registrado como um ciclo com abertura, encerramento e protocolo próprios, e o acesso à conversa passa a respeitar o setor e o papel de cada operador.",
      },
      {
        icon: "account_circle",
        title: "Nome e foto do contato",
        desc: "O nome e a foto de perfil do WhatsApp são buscados e mantidos atualizados nos contatos, com iniciais como alternativa quando a privacidade do cidadão bloqueia a imagem.",
      },
      {
        icon: "delete_sweep",
        title: "Gestão da fila",
        desc: "Administradores podem excluir uma conversa e resolver atendimentos direto da fila, sem precisar abrir cada um.",
      },
    ],
    correcoes: [
      "Corrigida a queda das sessões de WhatsApp: a criptografia de sessão travava o servidor por dezenas de segundos e derrubava as conexões (também era a causa do QR Code que não aparecia).",
      "Conexão com o WhatsApp resiste a mudanças de versão do WhatsApp Web, com atualização automática do protocolo.",
      "Mensagens enviadas pelo celular deixaram de ser creditadas ao primeiro administrador do sistema.",
      "Envio de arquivos acima de ~750 KB falhava em silêncio; o limite passou para 24 MB.",
      "A Iris não responde mais com conteúdo inválido nem contamina o próprio histórico da conversa.",
      "Ao reabrir uma conversa já resolvida, o atendimento volta corretamente para a Iris.",
      "O contador de mensagens não lidas zera ao abrir a conversa, em todas as abas.",
      "Atendimento sem setor escolhido herda o setor do atendente, mantendo os relatórios por secretaria corretos.",
      "Seletor de departamento não fecha mais ao rolar a tela e aparece acima dos modais.",
      "Corrigidos os textos de mídia recebida (\"áudio (áudio)\", gênero em \"documento recebido\") e a marcação de áudio ouvido, que agora persiste.",
      "Resolver e encaminhar avisam por mensagem na tela em vez de falhar em silêncio.",
      "Área de mensagens centralizada e com largura máxima, para não espalhar as bolhas nas bordas em monitores grandes.",
    ],
  },
  {
    versao: "v1.2.0",
    periodo: "Julho de 2026",
    resumo: "Acesso pelo celular, protocolos, respostas citadas, reações e o painel de relatórios.",
    novidades: [
      {
        icon: "smartphone",
        title: "Acesso pelo celular",
        desc: "Layout totalmente responsivo: no celular a navegação vira uma barra inferior, a lista de conversas e o painel de atendimento se alternam com um toque e há um menu \"Mais\" para as demais seções.",
      },
      {
        icon: "description",
        title: "Protocolos de atendimento",
        desc: "Nova seção de Protocolos: acompanhe e atualize o status de cada atendimento (aberto, em andamento, concluído, cancelado), com busca e filtro por departamento.",
      },
      {
        icon: "reply",
        title: "Responder citando mensagens",
        desc: "Responda a uma mensagem específica com a original em destaque. A citação é sincronizada com o WhatsApp do cidadão.",
      },
      {
        icon: "add_reaction",
        title: "Reações com emoji",
        desc: "Reaja a mensagens com emoji direto na conversa — a reação aparece também no WhatsApp do cidadão.",
      },
      {
        icon: "perm_media",
        title: "Galeria de mídia da conversa",
        desc: "Veja todas as fotos, vídeos, áudios e documentos trocados em uma conversa, reunidos em um só lugar.",
      },
      {
        icon: "mark_chat_unread",
        title: "Marcar como não lida",
        desc: "Marque uma conversa como não lida para retornar a ela depois, igual ao WhatsApp.",
      },
      {
        icon: "monitoring",
        title: "Painel de Relatórios",
        desc: "Novo painel (admin) com volume de conversas, tempo médio de 1ª resposta, taxa de resolução, horários de pico, ranking de atendentes, NPS e distribuição por setor e status.",
      },
      {
        icon: "view_sidebar",
        title: "Barra lateral redesenhada",
        desc: "O menu lateral agora exibe o nome ao lado de cada ícone (Atendimento, Agenda, Equipe, Protocolos, Relatórios, Notificações e Configurações), com um menu \"Mais\" para itens extras.",
      },
      {
        icon: "calendar_month",
        title: "Separadores de data nas conversas",
        desc: "As mensagens agora exibem separadores de data como no WhatsApp: \"Hoje\", \"Ontem\", dia da semana (ex: Segunda-feira) ou data completa (DD/MM/AAAA), facilitando a navegação pelo histórico.",
      },
      {
        icon: "touch_app",
        title: "Botões do topo funcionais",
        desc: "Os botões do cabeçalho da lista de conversas agora funcionam: Notificações, Nova conversa e o menu de perfil (configurações e sair).",
      },
    ],
    correcoes: [
      "Removidos os módulos sem uso (Tarefas, Arquivos, Reuniões e Wiki) para um menu mais limpo.",
      "Correção do status \"Aguardando mensagem\" em contatos com identificador LID.",
      "Agenda de contatos agora exibida em ordem alfabética.",
      "Correção do erro 503 causado pelo limite de requisições (rate limit).",
      "Tiques de entregue/lido corrigidos (status do Baileys é enum numérico).",
      "Operador não é mais re-adicionado ao departamento \"Geral\" a cada login.",
    ],
  },
];

export default function NovidadesChatGovPage() {
  const [atual, ...anteriores] = RELEASES;

  return (
    <AppLayout title="Novidades — ChatGov">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-[#001631] mb-6"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Voltar ao painel
        </Link>

        {/* Cabeçalho */}
        <div className="bg-gradient-to-br from-[#075e54] via-[#075e54] to-[#25D366] rounded-xl p-6 text-white mb-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
          <div className="relative flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
              <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-headline-lg font-bold">ChatGov</h2>
                <span className="px-2 py-0.5 bg-white/15 text-white text-[11px] rounded uppercase tracking-wider font-semibold">{atual.versao}</span>
              </div>
              <p className="text-body-md text-white/85 mt-1">{atual.resumo}</p>
            </div>
          </div>
        </div>

        {/* Novidades da versão atual */}
        <section className="mb-10">
          <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#25D366]">auto_awesome</span>
            Novidades desta versão
            <span className="text-label-md text-on-surface-variant font-normal">({atual.periodo})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {atual.novidades.map((n) => (
              <div key={n.title} className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 flex gap-3">
                <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg bg-[#075e54]/10 text-[#075e54]">
                  <span className="material-symbols-outlined">{n.icon}</span>
                </div>
                <div>
                  <h4 className="text-body-lg font-bold text-[#001631]">{n.title}</h4>
                  <p className="text-body-sm text-on-surface-variant mt-0.5 leading-relaxed">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Correções da versão atual */}
        <section className="mb-10">
          <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#006d3d]">build</span>
            Correções e melhorias
          </h3>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant divide-y divide-outline-variant">
            {atual.correcoes.map((c, i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                <span className="material-symbols-outlined text-[#006d3d] text-xl shrink-0">check_circle</span>
                <p className="text-body-md text-on-surface-variant">{c}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Versões anteriores */}
        {anteriores.length > 0 && (
          <section className="mb-10">
            <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant">history</span>
              Versões anteriores
            </h3>
            <div className="space-y-3">
              {anteriores.map((r) => (
                <details key={r.versao} className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden">
                  <summary className="cursor-pointer list-none p-4 flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
                    <span className="text-body-lg font-bold text-[#001631]">{r.versao}</span>
                    <span className="text-label-md text-on-surface-variant">{r.periodo}</span>
                  </summary>
                  <div className="px-4 pb-4 border-t border-outline-variant pt-4 space-y-4">
                    <ul className="space-y-2">
                      {r.novidades.map((n) => (
                        <li key={n.title} className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-[#075e54] text-xl shrink-0">{n.icon}</span>
                          <p className="text-body-sm text-on-surface-variant">
                            <span className="font-bold text-[#001631]">{n.title}. </span>
                            {n.desc}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <ul className="space-y-2">
                      {r.correcoes.map((c, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-[#006d3d] text-xl shrink-0">check_circle</span>
                          <p className="text-body-sm text-on-surface-variant">{c}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
