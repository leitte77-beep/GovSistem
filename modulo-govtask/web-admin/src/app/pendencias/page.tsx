"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { HeroPanel } from "@/components/ui/HeroPanel";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { notify } from "@/components/ui/Toast";
import { formatDate, daysUntil, prazoColor, cn } from "@/lib/utils";
import type { TarefaListItem } from "@/types/govtask";
import { CalendarClock, AlertTriangle, Clock, ClipboardCheck, Undo2, PlayCircle, ArrowRight } from "lucide-react";

type GroupKey = "hoje" | "atrasadas" | "proximos" | "analise" | "devolvidas" | "execucao";

const GROUPS: { key: GroupKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "hoje", label: "Hoje", icon: <CalendarClock className="w-4 h-4" />, color: "bg-[#B54708]/10 text-[#B54708]" },
  { key: "atrasadas", label: "Atrasadas", icon: <AlertTriangle className="w-4 h-4" />, color: "bg-[#B42318]/10 text-[#B42318]" },
  { key: "proximos", label: "Próximos 7 dias", icon: <Clock className="w-4 h-4" />, color: "bg-[#1D4ED8]/10 text-[#1D4ED8]" },
  { key: "analise", label: "Aguardando minha análise", icon: <ClipboardCheck className="w-4 h-4" />, color: "bg-[#067647]/10 text-[#067647]" },
  { key: "devolvidas", label: "Devolvidas", icon: <Undo2 className="w-4 h-4" />, color: "bg-[#B54708]/10 text-[#B54708]" },
  { key: "execucao", label: "Em execução", icon: <PlayCircle className="w-4 h-4" />, color: "bg-[#1D4ED8]/10 text-[#1D4ED8]" },
];

export default function PendenciasPage() {
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<GroupKey>("hoje");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTarefas((await api.listTarefas({ minhas: true, limit: 200 })) as unknown as TarefaListItem[]);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grupos = useMemo(() => {
    const hojeKey = new Date().toISOString().slice(0, 10);
    const hoje = tarefas.filter((t) => {
      if (["CONCLUIDA", "CANCELADA"].includes(t.status)) return false;
      return t.prazo && t.prazo.slice(0, 10) === hojeKey;
    });
    const atrasadas = tarefas.filter((t) => t.atrasada && !["CONCLUIDA", "CANCELADA"].includes(t.status));
    const proximos = tarefas.filter((t) => {
      if (!t.prazo || ["CONCLUIDA", "CANCELADA"].includes(t.status)) return false;
      const d = daysUntil(t.prazo);
      return d > 0 && d <= 7;
    });
    const analise = tarefas.filter((t) => t.status === "ENTREGUE");
    const devolvidas = tarefas.filter((t) => t.status === "DEVOLVIDA");
    const execucao = tarefas.filter((t) => ["EM_ANDAMENTO", "AGUARDANDO_ACEITE"].includes(t.status));
    return { hoje, atrasadas, proximos, analise, devolvidas, execucao };
  }, [tarefas]);

  const current = grupos[active];
  const total = Object.values(grupos).reduce((a, g) => a + g.length, 0);

  return (
    <div className="space-y-6">
      <HeroPanel
        eyebrow="Minha Caixa"
        title="Minhas Pendências"
        description="Tudo o que precisa da sua atenção: hoje, atrasado, próximos vencimentos e análises."
        stats={[
          { label: "Hoje", value: grupos.hoje.length },
          { label: "Atrasadas", value: grupos.atrasadas.length, accent: grupos.atrasadas.length > 0 },
          { label: "Próximos 7 dias", value: grupos.proximos.length },
          { label: "Aguardando análise", value: grupos.analise.length },
        ]}
      />

      {loading ? (
        <div className="space-y-4"><Skeleton variant="card" className="h-24" /><Skeleton variant="card" className="h-64" /></div>
      ) : (
        <>
          {/* Tabs de grupos */}
          <div className="flex flex-wrap gap-2">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                onClick={() => setActive(g.key)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-pill text-body-sm border transition-colors",
                  active === g.key ? "border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8] font-medium" : "border-surface-border bg-surface-card text-text-body hover:border-text-subtle"
                )}
              >
                <span className={cn("p-0.5 rounded", g.color)}>{g.icon}</span>
                {g.label}
                <Badge label={String(grupos[g.key].length)} color={g.color} />
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-body-sm text-text-body">
                <strong className="text-text-title">{current.length}</strong> {current.length === 1 ? "pendência" : "pendências"} em "{GROUPS.find((g) => g.key === active)?.label}"
              </p>
              <span className="text-meta text-text-subtle">Total: {total}</span>
            </div>

            {current.length === 0 ? (
              <Card padding="p-8">
                <EmptyState icon="check" title="Nada aqui" description="Você está em dia neste grupo. Continue assim!" />
              </Card>
            ) : (
              <div className="space-y-2">
                {current.map((t) => {
                  const dias = t.prazo ? daysUntil(t.prazo) : 0;
                  return (
                    <Link key={t.id} href={`/tarefas/${t.id}`} className="block p-4 rounded-card bg-surface-card border border-surface-border hover:shadow-card transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-medium text-text-title">{t.titulo}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <PriorityBadge priority={t.prioridade} />
                            {t.convenio && <span className="text-meta text-[#1D4ED8] line-clamp-1">{t.convenio.titulo}</span>}
                            {t.etapa?.nome && <Badge label={t.etapa.nome} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />}
                            {t.prazo && (
                              <span className={cn("text-meta font-medium flex items-center gap-1", prazoColor(dias))}>
                                <Clock className="w-3 h-3" /> {formatDate(t.prazo)} {dias < 0 ? `(${Math.abs(dias)}d atraso)` : dias === 0 ? "(hoje)" : dias <= 7 ? `(${dias}d)` : ""}
                              </span>
                            )}
                          </div>
                          {t.atribuida_a && <p className="text-meta text-text-subtle mt-1">Responsável: {t.atribuida_a.name}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusPill status={t.status} />
                          <ArrowRight className="w-4 h-4 text-text-subtle" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
