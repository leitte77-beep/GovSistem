"use client";

import React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";

interface Item {
  icon: string;
  title: string;
  desc: string;
}

const NOVIDADES: Item[] = [
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
    icon: "touch_app",
    title: "Botões do topo funcionais",
    desc: "Os botões do cabeçalho da lista de conversas agora funcionam: Notificações, Nova conversa e o menu de perfil (configurações e sair).",
  },
];

const CORRECOES: string[] = [
  "Removidos os módulos sem uso (Tarefas, Arquivos, Reuniões e Wiki) para um menu mais limpo.",
  "Correção do status \"Aguardando mensagem\" em contatos com identificador LID.",
  "Agenda de contatos agora exibida em ordem alfabética.",
  "Correção do erro 503 causado pelo limite de requisições (rate limit).",
  "Tiques de entregue/lido corrigidos (status do Baileys é enum numérico).",
  "Operador não é mais re-adicionado ao departamento \"Geral\" a cada login.",
];

export default function NovidadesChatGovPage() {
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
                <span className="px-2 py-0.5 bg-white/15 text-white text-[11px] rounded uppercase tracking-wider font-semibold">v1.2.0</span>
              </div>
              <p className="text-body-md text-white/85 mt-1">Novidades e correções desta versão.</p>
            </div>
          </div>
        </div>

        {/* Novidades */}
        <section className="mb-10">
          <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#25D366]">auto_awesome</span>
            Novidades desta versão
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {NOVIDADES.map((n) => (
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

        {/* Correções */}
        <section className="mb-10">
          <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#006d3d]">build</span>
            Correções e melhorias
          </h3>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant divide-y divide-outline-variant">
            {CORRECOES.map((c, i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                <span className="material-symbols-outlined text-[#006d3d] text-xl shrink-0">check_circle</span>
                <p className="text-body-md text-on-surface-variant">{c}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
