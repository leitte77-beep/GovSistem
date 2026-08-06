"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import type { Notificacao } from "@/types/govtask";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import {
  Bell,
  BellRing,
  Clock,
  AlertTriangle,
  CheckSquare,
  FileText,
  MessageSquare,
  CheckCheck,
} from "lucide-react";

function getIcon(tipo: string) {
  switch (tipo) {
    case "PRAZO_PROXIMO":
    case "PRAZO_VENCIDO":
      return Clock;
    case "TAREFA_ATRIBUIDA":
    case "TAREFA_ENTREGUE":
      return CheckSquare;
    case "TAREFA_DEVOLVIDA":
      return AlertTriangle;
    case "CONTESTACAO_ABERTA":
    case "CONTESTACAO_DECIDIDA":
      return MessageSquare;
    default:
      return Bell;
  }
}

function getIconColor(tipo: string): string {
  switch (tipo) {
    case "PRAZO_VENCIDO":
    case "TAREFA_DEVOLVIDA":
      return "text-[#B42318]";
    case "PRAZO_PROXIMO":
      return "text-[#B54708]";
    case "TAREFA_ATRIBUIDA":
    case "TAREFA_ENTREGUE":
      return "text-[#1D4ED8]";
    case "CONTESTACAO_ABERTA":
    case "CONTESTACAO_DECIDIDA":
      return "text-[#B54708]";
    default:
      return "text-text-subtle";
  }
}

function getLink(n: Notificacao): string {
  if (n.tarefa_id) return `/tarefas/${n.tarefa_id}`;
  if (n.convenio_id) return `/convenios/${n.convenio_id}`;
  return "#";
}

function groupByDate(notifs: Notificacao[]) {
  const hoje: Notificacao[] = [];
  const ontem: Notificacao[] = [];
  const anteriores: Notificacao[] = [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  notifs.forEach((n) => {
    const d = new Date(n.created_at);
    if (d >= todayStart) {
      hoje.push(n);
    } else if (d >= yesterdayStart) {
      ontem.push(n);
    } else {
      anteriores.push(n);
    }
  });

  return { hoje, ontem, anteriores };
}

export default function NotificacoesPage() {
  const router = useRouter();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("todas");

  const load = async () => {
    try {
      const data = await api.listNotificacoes({
        nao_lidas: filter === "nao_lidas",
      });
      setNotificacoes(data);
    } catch (e: any) {
      notify.error(e.message || "Erro ao carregar notificações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [filter]);

  const marcarTodas = async () => {
    try {
      await api.marcarTodasLidas();
      notify.success("Todas marcadas como lidas!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleClick = async (n: Notificacao) => {
    if (!n.lida) {
      try {
        await api.marcarLida(n.id);
      } catch {}
    }
    router.push(getLink(n));
  };

  const countNaoLidas = notificacoes.filter((n) => !n.lida).length;

  const tabs = [
    { key: "todas", label: "Todas", count: filter === "todas" ? notificacoes.length : undefined },
    { key: "nao_lidas", label: "Não lidas", count: filter === "nao_lidas" ? countNaoLidas : undefined },
  ];

  const grouped = useMemo(() => groupByDate(notificacoes), [notificacoes]);

  const renderGroup = (label: string, items: Notificacao[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <p className="text-meta font-medium text-text-subtle mb-2 px-1">{label}</p>
        <div className="space-y-1">
          {items.map((n) => {
            const Icon = getIcon(n.tipo);
            const iconColor = getIconColor(n.tipo);
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-card transition-colors hover:bg-surface-bg ${
                  !n.lida ? "bg-[#1D4ED8]/[0.03]" : ""
                }`}
              >
                <div className="relative shrink-0 mt-0.5">
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                  {!n.lida && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#1D4ED8] rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-body-sm ${!n.lida ? "font-medium text-text-title" : "text-text-body"}`}>
                    {n.mensagem}
                  </p>
                  <p className="text-meta text-text-subtle mt-0.5">{relativeTime(n.created_at)}</p>
                </div>
                {!n.lida && (
                  <span className="w-2 h-2 bg-[#1D4ED8] rounded-full shrink-0 mt-2" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Notificações"
        actions={
          <Button variant="secondary" size="sm" icon={CheckCheck} onClick={marcarTodas}>
            Marcar todas como lidas
          </Button>
        }
      />

      <Tabs tabs={tabs} active={filter} onChange={setFilter} />

      {loading ? (
        <div className="space-y-4">
          <Skeleton variant="text" className="h-4 w-24" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="text" className="h-16" />
            ))}
          </div>
        </div>
      ) : notificacoes.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nenhuma notificação"
          description={
            filter === "nao_lidas"
              ? "Você não tem notificações não lidas."
              : "Nenhuma notificação encontrada. As notificações aparecerão aqui quando houver atividade."
          }
        />
      ) : (
        <div className="space-y-6">
          {renderGroup("Hoje", grouped.hoje)}
          {renderGroup("Ontem", grouped.ontem)}
          {renderGroup("Anteriores", grouped.anteriores)}
        </div>
      )}
    </div>
  );
}
