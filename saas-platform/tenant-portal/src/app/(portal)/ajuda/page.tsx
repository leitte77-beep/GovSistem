"use client";
import { useState } from "react";
import {
  Blocks,
  Building2,
  KeyRound,
  ShieldCheck,
  LifeBuoy,
  ChevronDown,
  BookOpen,
  UserRound,
} from "lucide-react";

const GUIDES = [
  {
    icon: Blocks,
    title: "Acessar um módulo",
    text: "Todos os seus módulos liberados ficam na Dashboard. Basta clicar em “Acessar módulo” no card — você será levado direto ao sistema, sem precisar logar de novo.",
  },
  {
    icon: Building2,
    title: "Trocar de órgão",
    text: "Se você pertence a mais de um órgão, use o seletor de organização no topo da tela para alternar entre eles. Cada órgão tem seus próprios módulos e permissões.",
  },
  {
    icon: KeyRound,
    title: "Alterar senha",
    text: "Clique no seu nome, no topo da tela, e escolha “Segurança” para alterar a senha, ver suas sessões ativas e conhecer sua postura de segurança.",
  },
  {
    icon: UserRound,
    title: "Ver meu perfil",
    text: "Clique no seu nome no topo da tela e escolha “Meu perfil” para conferir seus dados cadastrados, perfil no órgão e e-mail.",
  },
];

const FAQ = [
  {
    q: "Não estou vendo um módulo que preciso",
    a: "O módulo precisa estar contratado pelo órgão e liberado para o seu perfil pelo gestor. Procure o gestor do seu órgão (área de Usuários) para solicitar o acesso.",
  },
  {
    q: "Não recebi meu acesso / não consigo entrar",
    a: "Verifique se o seu vínculo está ativo. Caso continue sem acesso, fale com o gestor do órgão responsável pela liberação dos módulos.",
  },
  {
    q: "Como altero a minha senha?",
    a: "Clique no seu nome no topo da tela e escolha “Segurança”. Lá você pode definir uma nova senha a qualquer momento.",
  },
  {
    q: "Esqueci minha senha",
    a: "Na tela de login, use a opção “Esqueci minha senha” para iniciar a recuperação por e-mail.",
  },
  {
    q: "Posso pertencer a mais de um órgão?",
    a: "Sim. Seu vínculo é independente por órgão. Você troca de órgão pelo seletor no topo da tela, sem perder o acesso aos módulos de cada um.",
  },
  {
    q: "Como faço para sair com segurança?",
    a: "Clique no seu nome no topo da tela e escolha “Sair”. Isso encerra a sua sessão no portal.",
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Ajuda e suporte</h1>
        <p className="text-sm text-on-surface-variant">
          Guias rápidos, perguntas frequentes e canais de contato do portal do órgão.
        </p>
      </div>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface">
          <BookOpen size={16} className="text-primary-700" /> Guias rápidos
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDES.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.title} className="rounded-xl border bg-surface-container-lowest p-5 shadow-sm">
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <Icon size={22} />
                </div>
                <h3 className="font-semibold text-on-surface">{g.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{g.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface">
          <ShieldCheck size={16} className="text-primary-700" /> Perguntas frequentes
        </h2>
        <div className="overflow-hidden rounded-xl border bg-surface-container-lowest shadow-sm">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="border-b border-outline-variant/60 last:border-b-0">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-on-surface">{item.q}</span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-on-surface-variant transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 text-sm leading-relaxed text-on-surface-variant">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex items-start gap-4 rounded-xl border border-primary-100 bg-primary-50/30 p-6">
        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
          <LifeBuoy size={22} />
        </div>
        <div>
          <h2 className="font-semibold text-on-surface">Ainda precisa de ajuda?</h2>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            A gestão de usuários e acessos do órgão é feita pelos gestores na área de Usuários. Para
            questões técnicas do GovSistem, entre em contato com a equipe de suporte.
          </p>
          <p className="mt-2 text-sm font-medium text-on-surface">
            Suporte: <span className="text-primary-700">contato@govsistem.com.br</span>
          </p>
        </div>
      </section>
    </div>
  );
}
