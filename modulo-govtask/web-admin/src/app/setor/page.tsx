"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { notify } from "@/components/ui/Toast";
import { formatDate, daysUntil, prazoColor, STATUS_LABELS, cn } from "@/lib/utils";
import type { TarefaListItem, Setor } from "@/types/govtask";
import { Building2, Clock, ArrowRight, CheckSquare, AlertTriangle } from "lucide-react";

const statusColumns = [
  { key: "AGUARDANDO_ACEITE", label: "Novas", color: "bg-[#1D4ED8]/10 text-[#1D4ED8]" },
  { key: "EM_ANDAMENTO", label: "Em andamento", color: "bg-[#1D4ED8]/10 text-[#1D4ED8]" },
  { key: "DEVOLVIDA", label: "Devolvidas", color: "bg-[#B54708]/10 text-[#B54708]" },
  { key: "CONTESTADA", label: "Contestadas", color: "bg-[#B54708]/10 text-[#B54708]" },
];

export default function SetorPage() {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [tarefasPorSetor, setTarefasPorSetor] = useState<Record<string, TarefaListItem[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const setoresData = await api.listSetores();
      setSetores(setoresData.filter((s) => s.ativo));
      if (!selected && setoresData.length > 0) setSelected(setoresData[0].id);
      const map: Record<string, TarefaListItem[]> = {};
      await Promise.all(
        setoresData.filter((s) => s.ativo).map(async (s) => {
          try {
            map[s.id] = (await api.listTarefas({ setor_id: s.id, limit: 100 })) as unknown as TarefaListItem[];
          } catch {
            map[s.id] = [];
          }
        })
      );
      setTarefasPorSetor(map);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const current = tarefasPorSetor[selected] || [];
  const atrasadas = current.filter((t) => t.atrasada && !["CONCLUIDA", "CANCELADA"].includes(t.status));

  const board = statusColumns.map((col) => ({
    ...col,
    items: current.filter((t) => t.status === col.key),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Departamentos"
        title="Demandas do Setor"
        description="Caixa de entrada por departamento: novas, em andamento, atrasadas e aguardando."
        breadcrumbs={[{ label: "Demandas do Setor" }]}
      />

      {loading ? (
        <div className="space-y-4"><Skeleton variant="card" className="h-24" /><Skeleton variant="card" className="h-64" /></div>
      ) : setores.length === 0 ? (
        <Card padding="p-8">
          <EmptyState icon="building" title="Nenhum setor cadastrado" description="Os setores aparecerão aqui após o administrador cadastrá-los." />
        </Card>
      ) : (
        <>
          {/* Seletor de setor + resumo */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="lg:w-64">
              <Card padding="p-4">
                <p className="text-label text-text-subtle mb-2">Departamento</p>
                <div className="space-y-1">
                  {setores.map((s) => {
                    const tasks = tarefasPorSetor[s.id] || [];
                    const novas = tasks.filter((t) => t.status === "AGUARDANDO_ACEITE").length;
                    const atr = tasks.filter((t) => t.atrasada && !["CONCLUIDA", "CANCELADA"].includes(t.status)).length;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelected(s.id)}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-btn text-body-sm transition-colors",
                          selected === s.id ? "bg-[#1D4ED8]/10 text-[#1D4ED8] font-medium" : "hover:bg-[#F6F7F9] text-text-body"
                        )}
                      >
                        <span className="flex items-center gap-2 truncate"><Building2 className="w-4 h-4 shrink-0" />{s.nome}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {atr > 0 && <span className="text-meta text-[#B42318] font-bold">{atr} atr</span>}
                          {novas > 0 && <span className="text-meta px-1.5 py-0.5 rounded-pill bg-[#1D4ED8]/10 text-[#1D4ED8]">{novas}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            <div className="flex-1 space-y-4">
              {/* Cards de métricas do setor selecionado */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Novas</p>
                  <p className="text-h2 text-text-title">{current.filter((t) => t.status === "AGUARDANDO_ACEITE").length}</p>
                </Card>
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Em andamento</p>
                  <p className="text-h2 text-text-title">{current.filter((t) => t.status === "EM_ANDAMENTO").length}</p>
                </Card>
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Aguardando</p>
                  <p className="text-h2 text-text-title">{current.filter((t) => ["ENTREGUE", "DEVOLVIDA", "CONTESTADA"].includes(t.status)).length}</p>
                </Card>
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Atrasadas</p>
                  <p className={cn("text-h2", atrasadas.length > 0 ? "text-[#B42318]" : "text-text-title")}>{atrasadas.length}</p>
                </Card>
              </div>

              {/* Board de status */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {board.map((col) => (
                  <div key={col.key} className="bg-surface-bg rounded-card p-3">
                    <div className="flex items-center justify-between mb-3">
                      <Badge label={col.label} color={col.color} />
                      <span className="text-meta text-text-subtle">{col.items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {col.items.map((t) => {
                        const dias = t.prazo ? daysUntil(t.prazo) : 0;
                        return (
                          <Link key={t.id} href={`/tarefas/${t.id}`} className="block bg-surface-card rounded-btn p-3 border border-surface-border hover:shadow-card transition-shadow">
                            <p className="text-body-sm font-medium text-text-title line-clamp-2">{t.titulo}</p>
                            {t.convenio && (
                              <p className="text-meta text-[#1D4ED8] hover:underline mt-0.5 line-clamp-1">{t.convenio.titulo}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <PriorityBadge priority={t.prioridade} />
                              {t.prazo && (
                                <span className={cn("text-meta flex items-center gap-1", prazoColor(dias))}>
                                  <Clock className="w-3 h-3" />{formatDate(t.prazo)}
                                </span>
                              )}
                              {t.atrasada && (
                                <span className="text-meta text-[#B42318] font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Atrasada</span>
                              )}
                            </div>
                            {t.atribuida_a && <p className="text-meta text-text-subtle mt-1.5">{t.atribuida_a.name}</p>}
                          </Link>
                        );
                      })}
                      {col.items.length === 0 && (
                        <p className="text-meta text-text-subtle text-center py-4">Nenhuma tarefa</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Link href={`/tarefas?setor_id=${selected}`}>
                  <span className="text-body-sm text-[#1D4ED8] hover:underline flex items-center gap-1">Ver todas as tarefas do setor <ArrowRight className="w-4 h-4" /></span>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
