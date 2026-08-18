"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { CaixaAba, ProcessoOut, TramitacaoCaixaOut } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { formatDateTime } from "@/lib/format";
import { SituacaoBadge } from "@/components/processo/badges";
import Badge from "@/components/Badge";

const ABAS: { key: CaixaAba; label: string; icon: string }[] = [
  { key: "recebidos", label: "Recebidos", icon: "move_to_inbox" },
  { key: "atribuidos", label: "Atribuídos a mim", icon: "assignment_ind" },
  { key: "nao-visualizados", label: "Não visualizados", icon: "mark_email_unread" },
  { key: "aguardando-acao", label: "Aguardando ação", icon: "pending_actions" },
  { key: "aguardando-retorno", label: "Aguardando retorno", icon: "hourglass_top" },
  { key: "enviados", label: "Enviados", icon: "outbox" },
  { key: "concluidos", label: "Concluídos", icon: "task_alt" },
];

function ehTramitacao(item: ProcessoOut | TramitacaoCaixaOut): item is TramitacaoCaixaOut {
  return "processo_id" in item;
}

const ABAS_VALIDAS = new Set(ABAS.map((a) => a.key));

export default function MinhaCaixaPage() {
  const searchParams = useSearchParams();
  const abaInicial = searchParams.get("aba");
  const [aba, setAba] = useState<CaixaAba>(
    abaInicial && ABAS_VALIDAS.has(abaInicial as CaixaAba) ? (abaInicial as CaixaAba) : "aguardando-acao"
  );
  const [itens, setItens] = useState<(ProcessoOut | TramitacaoCaixaOut)[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback((a: CaixaAba) => {
    setLoading(true);
    setErro(false);
    api
      .minhaCaixa(a)
      .then(setItens)
      .catch((err) => {
        setErro(true);
        toast.error(err instanceof Error ? err.message : "Falha ao carregar sua caixa");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar(aba);
  }, [aba, carregar]);

  const EMPTY_COPY: Record<CaixaAba, { title: string; description: string }> = {
    recebidos: {
      title: "Nenhum processo recebido",
      description: "Processos que chegarem à sua unidade aparecerão aqui.",
    },
    atribuidos: {
      title: "Nenhum processo atribuído a você",
      description: "Quando alguém atribuir um processo a você, ele aparecerá aqui.",
    },
    "nao-visualizados": {
      title: "Tudo em dia",
      description: "Você já visualizou todos os processos da sua unidade.",
    },
    "aguardando-acao": {
      title: "Nenhum processo aguardando ação",
      description: "Processos recebidos ou em análise na sua unidade aparecem aqui.",
    },
    "aguardando-retorno": {
      title: "Nenhum retorno pendente",
      description: "Envios com prazo de resposta aparecem aqui até serem recebidos.",
    },
    enviados: {
      title: "Nenhum envio realizado",
      description: "O histórico de envios da sua unidade aparecerá aqui.",
    },
    concluidos: {
      title: "Nenhum processo concluído",
      description: "Processos concluídos na sua unidade aparecerão aqui.",
    },
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader title="Controle de Processos" subtitle="Sua visão de trabalho: o que chegou, o que é seu e o que está pendente." />

      <div className="px-gutter max-w-container-max mx-auto">
        <div className="flex gap-1 border-b border-outline-variant mb-6 overflow-x-auto" role="tablist">
          {ABAS.map((a) => (
            <button
              key={a.key}
              role="tab"
              aria-selected={aba === a.key}
              onClick={() => setAba(a.key)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-label-md font-label-md whitespace-nowrap border-b-2 -mb-px transition-colors ${
                aba === a.key
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : erro ? (
          <EmptyState
            icon="error"
            title="Não foi possível carregar"
            description="Tente novamente em instantes."
            action={
              <button
                onClick={() => carregar(aba)}
                className="h-10 px-4 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
              >
                Tentar novamente
              </button>
            }
          />
        ) : itens.length === 0 ? (
          <EmptyState icon="inbox" title={EMPTY_COPY[aba].title} description={EMPTY_COPY[aba].description} />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <ul className="divide-y divide-outline-variant">
              {itens.map((item) => {
                const tramitacao = ehTramitacao(item);
                const processoId = tramitacao ? item.processo_id : item.id;
                return (
                  <li key={item.id}>
                    <Link
                      href={`/processos/${processoId}`}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-surface-container-low transition-colors"
                    >
                      <span className="font-mono text-body-sm text-primary w-32 flex-shrink-0">{item.nup}</span>
                      <span className="flex-1 text-body-md text-on-surface truncate">{item.especificacao}</span>
                      <span className="flex items-center gap-3 flex-shrink-0">
                        {tramitacao ? (
                          <>
                            {item.prazo_dias != null && (
                              <Badge tone="neutral">{item.prazo_dias} dias</Badge>
                            )}
                            <Badge tone={item.recebida ? "success" : "warning"}>
                              {item.recebida ? "Recebida" : "Pendente"}
                            </Badge>
                          </>
                        ) : (
                          <SituacaoBadge situacao={item.situacao} />
                        )}
                        <span className="text-body-sm text-on-surface-variant hidden sm:inline">
                          {formatDateTime(item.created_at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
