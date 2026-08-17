"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PrazoItem, ProcessoOut } from "@/types/govpro";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { SituacaoBadge } from "@/components/processo/badges";

interface Contadores {
  aguardandoAcao: number;
  naoVisualizados: number;
  atribuidos: number;
  aguardandoRetorno: number;
}

export default function DashboardPage() {
  const [prazos, setPrazos] = useState<PrazoItem[]>([]);
  const [recentes, setRecentes] = useState<ProcessoOut[]>([]);
  const [contadores, setContadores] = useState<Contadores | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.meusPrazos(false).catch(() => [] as PrazoItem[]),
      api.listProcessos({ limit: 5 }).catch(() => [] as ProcessoOut[]),
      api.minhaCaixa("aguardando-acao").catch(() => []),
      api.minhaCaixa("nao-visualizados").catch(() => []),
      api.minhaCaixa("atribuidos").catch(() => []),
      api.minhaCaixa("aguardando-retorno").catch(() => []),
    ]).then(([p, r, aguardandoAcao, naoVisualizados, atribuidos, aguardandoRetorno]) => {
      setPrazos(p);
      setRecentes(r);
      setContadores({
        aguardandoAcao: aguardandoAcao.length,
        naoVisualizados: naoVisualizados.length,
        atribuidos: atribuidos.length,
        aguardandoRetorno: aguardandoRetorno.length,
      });
      setLoading(false);
    });
  }, []);

  const vencidos = prazos.filter((p) => new Date(p.data_vencimento) < new Date());
  const aVencer = prazos.filter((p) => new Date(p.data_vencimento) >= new Date());

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da sua caixa de trabalho, prazos e processos recentes."
      />

      <div className="px-gutter max-w-container-max mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard
          href="/caixa?aba=aguardando-acao"
          icon="pending_actions"
          label="Na minha caixa"
          value={contadores ? String(contadores.aguardandoAcao) : "—"}
          tone="primary"
        />
        <StatCard
          href="/caixa?aba=nao-visualizados"
          icon="mark_email_unread"
          label="Não visualizados"
          value={contadores ? String(contadores.naoVisualizados) : "—"}
          tone="primary"
        />
        <StatCard
          href="/caixa?aba=atribuidos"
          icon="assignment_ind"
          label="Atribuídos a mim"
          value={contadores ? String(contadores.atribuidos) : "—"}
          tone="success"
        />
        <StatCard
          href="/caixa?aba=aguardando-retorno"
          icon="hourglass_top"
          label="Aguardando retorno"
          value={contadores ? String(contadores.aguardandoRetorno) : "—"}
          tone="success"
        />
        <StatCard href="/prazos" icon="schedule" label="Prazos vencidos" value={String(vencidos.length)} tone="error" />
        <StatCard href="/prazos" icon="event_upcoming" label="Prazos a vencer" value={String(aVencer.length)} tone="primary" />
        <StatCard href="/processos" icon="folder_open" label="Processos recentes" value={String(recentes.length)} tone="success" />
      </div>

      <div className="px-gutter max-w-container-max mx-auto mt-stack-lg">
        <h2 className="text-headline-sm font-headline-sm text-on-surface mb-4">Processos recentes</h2>
        {loading ? (
          <Skeleton />
        ) : recentes.length === 0 ? (
          <EmptyState
            icon="folder_open"
            title="Nenhum processo ainda"
            description="Autue o primeiro processo para começar a tramitar."
            action={
              <Link
                href="/processos/novo"
                className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
                Autuar processo
              </Link>
            }
          />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <ul className="divide-y divide-outline-variant">
              {recentes.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/processos/${p.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-surface-container-low transition-colors"
                  >
                    <span className="font-mono text-body-sm text-primary">{p.nup}</span>
                    <span className="flex-1 text-body-md text-on-surface truncate">{p.especificacao}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-body-sm text-on-surface-variant">{formatDate(p.data_autuacao)}</span>
                      <SituacaoBadge situacao={p.situacao} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  href,
  icon,
  label,
  value,
  tone,
}: {
  href: string;
  icon: string;
  label: string;
  value: string;
  tone: "error" | "primary" | "success";
}) {
  const tones = {
    error: "text-error bg-error-container/40",
    primary: "text-primary bg-primary-container/15",
    success: "text-on-secondary-container bg-secondary-container/30",
  };
  return (
    <Link
      href={href}
      className="bg-surface-container-lowest rounded-lg border border-outline-variant p-5 flex items-center gap-4 hover:border-primary transition-colors"
    >
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <span className="material-symbols-outlined text-[24px]" aria-hidden="true">{icon}</span>
      </div>
      <div className="min-w-0">
        <div className="text-headline-lg font-headline-lg leading-none">{value}</div>
        <div className="text-label-md font-label-md text-on-surface-variant mt-1 truncate">{label}</div>
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-6 space-y-3 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-4 bg-surface-container-high rounded" />
      ))}
    </div>
  );
}
