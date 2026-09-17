"use client";

/**
 * Agenda de cobrança dos protocolos externos (§71, §72).
 *
 * Responde a pergunta que o assessor faz toda manhã: "o que eu preciso cobrar
 * hoje?". Um protocolo sem acompanhamento agendado aparece à parte de
 * propósito: é exatamente o que costuma dormir esquecido no órgão.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock, CalendarClock, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/utils";
import type { AgendaProtocolos } from "@/types/govtask";

export default function ProtocolosPage() {
  const [agenda, setAgenda] = useState<AgendaProtocolos>();
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.agendaProtocolos()
      .then(setAgenda)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar a agenda"));
  }, []);

  if (erro) return <div className="rounded-xl bg-red-50 p-5 text-red-800">{erro}</div>;
  if (!agenda) return <Skeleton variant="card" className="h-64" />;

  const nada =
    !agenda.cobrar_hoje.length &&
    !agenda.prazo_de_resposta_vencido.length &&
    !agenda.sem_acompanhamento_agendado.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Acompanhamento externo"
        title="Cobranças de protocolo"
        description={`${agenda.total_abertos} protocolo(s) em aberto nos órgãos externos.`}
        breadcrumbs={[{ label: "Protocolos" }]}
      />

      {nada ? (
        <Card padding="p-8">
          <EmptyState
            icon="search"
            title="Nada a cobrar hoje"
            description="Todos os protocolos em aberto têm acompanhamento agendado e prazo em dia."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Bloco
            titulo="Cobrar hoje"
            descricao="A data de acompanhamento chegou ou passou."
            icone={<CalendarClock className="h-5 w-5 text-amber-700" />}
            cor="border-amber-200 bg-amber-50/40"
            quantidade={agenda.cobrar_hoje.length}
          >
            {agenda.cobrar_hoje.map((p) => (
              <Item
                key={p.id}
                href={`/demandas/${p.demanda_id}`}
                titulo={`${p.sistema} nº ${p.numero}`}
                detalhe={`${p.orgao || "Órgão não informado"} · ${p.situacao.replaceAll("_", " ").toLowerCase()}`}
                direita={p.proxima_verificacao ? `agendado para ${formatDate(p.proxima_verificacao)}` : ""}
              />
            ))}
          </Bloco>

          <Bloco
            titulo="Prazo de resposta vencido"
            descricao="O órgão passou do prazo que ele mesmo informou."
            icone={<AlarmClock className="h-5 w-5 text-red-700" />}
            cor="border-red-200 bg-red-50/40"
            quantidade={agenda.prazo_de_resposta_vencido.length}
          >
            {agenda.prazo_de_resposta_vencido.map((p) => (
              <Item
                key={p.id}
                href={`/demandas/${p.demanda_id}`}
                titulo={`${p.sistema} nº ${p.numero}`}
                detalhe="Sem resposta dentro do prazo"
                direita={p.prazo_resposta ? `vencido em ${formatDate(p.prazo_resposta)}` : ""}
              />
            ))}
          </Bloco>

          <Bloco
            titulo="Sem acompanhamento agendado"
            descricao="Ninguém definiu quando cobrar — é aqui que o processo dorme."
            icone={<HelpCircle className="h-5 w-5 text-slate-600" />}
            cor="border-slate-200 bg-white"
            quantidade={agenda.sem_acompanhamento_agendado.length}
          >
            {agenda.sem_acompanhamento_agendado.map((p) => (
              <Item
                key={p.id}
                href={`/demandas/${p.demanda_id}`}
                titulo={`Protocolo nº ${p.numero}`}
                detalhe="Defina uma data de cobrança na aba Protocolos da demanda"
              />
            ))}
          </Bloco>
        </div>
      )}
    </div>
  );
}

function Bloco({ titulo, descricao, icone, cor, quantidade, children }: {
  titulo: string; descricao: string; icone: React.ReactNode; cor: string;
  quantidade: number; children: React.ReactNode;
}) {
  if (!quantidade) return null;
  return (
    <section className={`overflow-hidden rounded-xl border ${cor}`}>
      <header className="flex items-start gap-3 p-5">
        {icone}
        <div>
          <h2 className="font-bold text-slate-900">{titulo} ({quantidade})</h2>
          <p className="text-sm text-slate-600">{descricao}</p>
        </div>
      </header>
      <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-white">{children}</ul>
    </section>
  );
}

function Item({ href, titulo, detalhe, direita }: {
  href: string; titulo: string; detalhe: string; direita?: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50">
        <div className="min-w-0">
          <p className="font-medium text-slate-800">{titulo}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{detalhe}</p>
        </div>
        {direita && <span className="shrink-0 text-xs font-semibold text-slate-600">{direita}</span>}
      </Link>
    </li>
  );
}
