"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusPill } from "@/components/ui/StatusPill";
import { notify } from "@/components/ui/Toast";
import { formatDate, daysUntil, prazoColor, cn } from "@/lib/utils";
import type { TarefaListItem, Setor, ConvenioListItem, DashboardData } from "@/types/govtask";
import {
  Building2, Undo2, ClipboardCheck, Send, AlertTriangle, Clock,
  ShieldAlert, ArrowRight, CheckSquare,
} from "lucide-react";

export default function CoordenadorPage() {
  const { hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [semMov, setSemMov] = useState<{ processo_id: string; processo: string; sem_movimentacao_dias: number | null }[]>([]);

  const canView = hasRole("ASSESSOR", "ADMIN", "GESTOR");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [setoresData, conv, dd, alertas] = await Promise.all([
        api.listSetores(),
        api.listConvenios({ limit: 100 }),
        api.getDashboard().catch(() => null),
        api.listarAlertas().catch(() => ({ alertas: [], riscos: [] as any[] })),
      ]);
      setSetores(setoresData);
      setConvenios(conv);
      setDashboardData(dd);

      // Agrega tarefas por setor para agrupar por departamento
      const map = new Map<string, TarefaListItem>();
      await Promise.all(
        setoresData.filter((s) => s.ativo).map(async (s) => {
          try {
            const tasks = (await api.listTarefas({ setor_id: s.id, limit: 100 })) as unknown as TarefaListItem[];
            for (const t of tasks) {
              map.set(t.id, { ...t, etapa: { id: s.id, nome: s.nome } as any });
            }
          } catch {}
        })
      );
      setTarefas(Array.from(map.values()));

      const riscos = (alertas as any).riscos || [];
      setSemMov(riscos.filter((r: any) => r.sem_movimentacao_dias).map((r: any) => ({
        processo_id: r.processo_id, processo: r.processo, sem_movimentacao_dias: r.sem_movimentacao_dias,
      })));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView]);

  const aguardandoSetores = useMemo(() => {
    const map = new Map<string, TarefaListItem[]>();
    for (const t of tarefas) {
      if (["AGUARDANDO_ACEITE", "EM_ANDAMENTO"].includes(t.status)) {
        const setor = t.etapa?.nome || "Geral";
        if (!map.has(setor)) map.set(setor, []);
        map.get(setor)!.push(t);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [tarefas]);

  const devolvidas = tarefas.filter((t) => t.status === "DEVOLVIDA");
  const paraAnalisar = tarefas.filter((t) => t.status === "ENTREGUE");
  const semProtocolo = convenios.filter((c) => !c.numero_protocolo_governo && !["CONCLUIDO", "CANCELADO"].includes(c.status));
  const prazosCriticos = tarefas
    .filter((t) => {
      if (["CONCLUIDA", "CANCELADA"].includes(t.status)) return false;
      if (t.atrasada) return true;
      if (!t.prazo) return false;
      return daysUntil(t.prazo) <= 3;
    })
    .sort((a, b) => (a.prazo || "").localeCompare(b.prazo || ""));

  if (!canView) {
    return (
      <Card padding="p-8">
        <EmptyState icon="lock" title="Acesso restrito" description="Este painel é exclusivo do assessor/coordenador." />
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Painel do Coordenador" description="Central de coordenação de todos os processos." breadcrumbs={[{ label: "Painel do Coordenador" }]} />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="card" className="h-24" />)}
        </div>
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  const metric = (label: string, value: number | string, href: string, color = "#1D4ED8") => (
    <Link href={href} className="bg-surface-card border border-surface-border rounded-card p-4 hover:shadow-card transition-shadow block">
      <p className="text-h2 text-text-title tabular-nums" style={{ color }}>{value}</p>
      <p className="text-body-sm text-text-body mt-0.5">{label}</p>
    </Link>
  );

  const renderTaskRow = (t: TarefaListItem, showSetor = false) => {
    const dias = t.prazo ? daysUntil(t.prazo) : 0;
    return (
      <Link key={t.id} href={`/tarefas/${t.id}`} className="flex items-center justify-between gap-2 p-2.5 rounded-btn hover:bg-[#F6F7F9] border border-transparent hover:border-surface-border transition-colors">
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium text-text-title truncate">{t.titulo}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <PriorityBadge priority={t.prioridade} />
            {t.convenio && <span className="text-meta text-[#1D4ED8] truncate">{t.convenio.titulo}</span>}
            {showSetor && t.etapa?.nome && <Badge label={t.etapa.nome} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />}
            {t.prazo && <span className={cn("text-meta", prazoColor(dias))}>{formatDate(t.prazo)}{t.atrasada ? " · atrasada" : ""}</span>}
          </div>
        </div>
        <StatusPill status={t.status} />
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coordenação"
        title="Painel do Coordenador"
        description="Central de coordenação: quem está com cada pendência, o que precisa protocolizar e o que está parado."
        breadcrumbs={[{ label: "Painel do Coordenador" }]}
        actions={
          <Link href="/pendencias">
            <Button icon={CheckSquare}>Minhas Pendências</Button>
          </Link>
        }
      />

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {metric("Aguardando setores", aguardandoSetores.reduce((a, [, v]) => a + v.length, 0), "/setor")}
        {metric("Devolvido pelos setores", devolvidas.length, "/setor", devolvidas.length ? "#B54708" : "#1D4ED8")}
        {metric("Preciso analisar", paraAnalisar.length, "/setor", paraAnalisar.length ? "#B54708" : "#1D4ED8")}
        {metric("Preciso protocolar", semProtocolo.length, "/convenios", semProtocolo.length ? "#B54708" : "#1D4ED8")}
        {metric("Aguardando Governo", dashboardData?.aguardando_governo ?? 0, "/convenios")}
        {metric("Diligências abertas", dashboardData?.diligencias_abertas ?? 0, "/alertas", (dashboardData?.diligencias_abertas ?? 0) ? "#B42318" : "#1D4ED8")}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Aguardando setores */}
        <div className="lg:col-span-7 space-y-6">
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-[#1D4ED8]" />
              <h3 className="text-h3 text-text-title">Aguardando setores</h3>
            </div>
            {aguardandoSetores.length === 0 ? (
              <p className="text-body-sm text-text-subtle">Nenhuma demanda em aberto nos setores.</p>
            ) : (
              <div className="space-y-4">
                {aguardandoSetores.map(([setor, tasks]) => (
                  <div key={setor}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-body-sm font-medium text-text-title">{setor}</span>
                      <Badge label={`${tasks.length}`} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
                    </div>
                    <div className="space-y-0.5">
                      {tasks.slice(0, 4).map((t) => renderTaskRow(t))}
                      {tasks.length > 4 && <p className="text-meta text-text-subtle pl-2">+{tasks.length - 4} mais...</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Devolvido pelos setores */}
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Undo2 className="w-5 h-5 text-[#B54708]" />
              <h3 className="text-h3 text-text-title">Devolvido pelos setores</h3>
            </div>
            {devolvidas.length === 0 ? (
              <p className="text-body-sm text-text-subtle">Nenhuma tarefa devolvida.</p>
            ) : (
              <div className="space-y-0.5">{devolvidas.slice(0, 8).map((t) => renderTaskRow(t, true))}</div>
            )}
          </Card>

          {/* Preciso analisar */}
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck className="w-5 h-5 text-[#067647]" />
              <h3 className="text-h3 text-text-title">Preciso analisar</h3>
            </div>
            {paraAnalisar.length === 0 ? (
              <p className="text-body-sm text-text-subtle">Nada aguardando sua análise.</p>
            ) : (
              <div className="space-y-0.5">{paraAnalisar.slice(0, 8).map((t) => renderTaskRow(t, true))}</div>
            )}
          </Card>
        </div>

        {/* Coluna direita */}
        <div className="lg:col-span-5 space-y-6">
          {/* Preciso protocolar externamente */}
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Send className="w-5 h-5 text-[#B54708]" />
              <h3 className="text-h3 text-text-title">Preciso protocolar externamente</h3>
            </div>
            {semProtocolo.length === 0 ? (
              <p className="text-body-sm text-text-subtle">Todos os processos têm protocolo registrado.</p>
            ) : (
              <div className="space-y-0.5">
                {semProtocolo.slice(0, 8).map((c) => (
                  <Link key={c.id} href={`/convenios/${c.id}`} className="flex items-center justify-between gap-2 p-2.5 rounded-btn hover:bg-[#F6F7F9] transition-colors">
                    <span className="text-body-sm font-medium text-text-title truncate">{c.titulo}</span>
                    <StatusPill status={c.status} />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Prazos críticos */}
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-[#B42318]" />
              <h3 className="text-h3 text-text-title">Prazos críticos</h3>
            </div>
            {prazosCriticos.length === 0 ? (
              <p className="text-body-sm text-text-subtle">Nenhum prazo crítico.</p>
            ) : (
              <div className="space-y-0.5">{prazosCriticos.slice(0, 8).map((t) => renderTaskRow(t))}</div>
            )}
          </Card>

          {/* Processos sem movimentação */}
          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-5 h-5 text-[#1D4ED8]" />
              <h3 className="text-h3 text-text-title">Sem movimentação</h3>
            </div>
            {semMov.length === 0 ? (
              <p className="text-body-sm text-text-subtle">Nenhum processo parado.</p>
            ) : (
              <div className="space-y-2">
                {semMov.slice(0, 8).map((p) => (
                  <Link key={p.processo_id} href={`/convenios/${p.processo_id}`} className="flex items-center justify-between gap-2 p-2.5 rounded-btn hover:bg-[#F6F7F9] transition-colors">
                    <span className="text-body-sm font-medium text-text-title truncate">{p.processo}</span>
                    <Badge label={`${p.sem_movimentacao_dias} dias`} color="bg-[#B54708]/10 text-[#B54708]" />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card padding="p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-[#667085]" />
              <h3 className="text-h3 text-text-title">Resumo executivo</h3>
            </div>
            <div className="space-y-1.5 text-body-sm text-text-body">
              <p>• Valor aprovado: <strong className="text-text-title">{formatCurrencyBrl(dashboardData?.valor_aprovado ?? 0)}</strong></p>
              <p>• Valor executado: <strong className="text-text-title">{formatCurrencyBrl(dashboardData?.valor_executado ?? 0)}</strong></p>
              <p>• <strong className="text-text-title">{dashboardData?.obras_em_andamento ?? 0}</strong> obras em andamento</p>
              <p>• <strong className="text-text-title">{dashboardData?.prestacoes_pendentes ?? 0}</strong> prestações pendentes</p>
              <Link href="/executivo" className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline mt-2">Ver painel executivo <ArrowRight className="w-4 h-4" /></Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatCurrencyBrl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
